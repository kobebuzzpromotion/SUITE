import Foundation
import CoreImage
import ImageIO
import UniformTypeIdentifiers
import CryptoKit
import SuiteCore

/// Tiled large-print transport called explicitly by PhotoPipeline. Uses the same
/// validated native Recipe subset as PhotoPipeline, never a Proxy as a Final.
/// TIFF 6.0 RGB, uncompressed, 8/16-bit, ICC tagged. No full output bitmap.
/// Apple APIs: developer.apple.com/documentation/coreimage/cicontext/starttask(torender:from:to:at:)
/// developer.apple.com/documentation/coreimage/cirenderdestination
/// developer.apple.com/documentation/coregraphics/cgcolorspace/copyiccdata()
actor Delta66LargePrint {
    enum Placement: Sendable {
        case requireMatchingAspect
        case fitWhiteMargins
        /// Explicit crop anchor in normalized upper-left coordinates.
        case fillCrop(x: Double, y: Double)
    }
    enum Upscale: Sendable { case rejectInsufficient, resampleAcknowledged }
    struct Options: Sendable {
        var widthMM: Double = 1456
        var heightMM: Double = 2060
        var dpi: Int = 300
        var placement: Placement = .requireMatchingAspect
        var upscale: Upscale = .rejectInsufficient
        /// Combined app-owned tile + strip + header budget, NOT total OS memory.
        var bufferBudget: Int = 32 * 1024 * 1024
        var rowsPerStrip: Int = 32
        var tileWidth: Int = 2048
        /// Conservative admission estimate (32 bytes per source pixel). Core
        /// Image/RAW plugins do not expose a hard decoder allocation ceiling.
        var sourceDecodeAdmissionBytes: UInt64 = 1024 * 1024 * 1024
    }
    struct Receipt: Sendable {
        let file: URL
        let width: Int
        let height: Int
        let dpi: Int
        let bitsPerSample: Int
        let colorSpace: ExportColorSpace
        let byteCount: UInt64
        /// Only this writer's explicit buffers; excludes decoder, filter graph,
        /// and PortraitPipeline's original-resolution analysis/mask allocations.
        let writerOwnedPeakBufferBound: Int
        let sourceDecodeEstimateBytes: UInt64
        let conventionalResamplingUsed: Bool
        let cancellationRequestedAfterCommit: Bool
        let osDecoderMemoryBoundGuaranteed = false
        let aiUpscaleUsed = false
    }
    enum Failure: LocalizedError {
        case invalidOptions, unsupportedEncoding, unsupportedMetadata, unsupportedSource
        case sourceDecodeBudget, bufferBudget, bigTIFFRequired, sourceIntegrity
        case aspectMismatch, insufficientResolution, destinationExists, diskSpace, resourcePressure
        var errorDescription: String? {
            switch self {
            case .invalidOptions: "大判寸法・処理予算が不正です。"
            case .unsupportedEncoding: "この大判経路は非圧縮RGB TIFF 8/16bit専用です。透過/LZWは要求を変更せず拒否します。"
            case .unsupportedMetadata: "この大判経路は必須TIFF/ICCメタデータのみです。原本メタデータ保持要求は未対応です。"
            case .unsupportedSource: "原本をOSの画像デコーダーで読み込めません。埋込Previewへの代用はしません。"
            case .sourceDecodeBudget: "原本の推定デコード量が指定予算を超えます。原本は変更していません。"
            case .bufferBudget: "描画tileとTIFF帯のバッファ予算が不足しています。"
            case .bigTIFFRequired: "4GiB以上にはBigTIFFが必要です。この経路は対応していません。"
            case .sourceIntegrity: "原本のSHA256が一致しません。"
            case .aspectMismatch: "仕上がり比率が異なります。余白またはCrop位置を明示してください。"
            case .insufficientResolution: "必要画素数が不足しています。通常補間を明示許可するか寸法を変更してください。"
            case .destinationExists: "同名出力があります。上書きはしていません。"
            case .diskSpace: "一時原本とTIFFを保存する空き容量が不足しています。"
            case .resourcePressure: "端末の温度が回復するまで大判処理を待機してください。"
            }
        }
    }
    private struct TIFFLayout {
        let header: Data
        let offsets: [UInt32]
        let counts: [UInt32]
        let total: UInt64
    }

    func render(_ request: RAWRenderRequest, validatingWith pipeline: PhotoPipeline,
                options: Options = Options()) async throws -> Receipt {
        let cancellation = LocalRetouchTiledRenderer.Cancellation()
        defer { cancellation.cancel() }
        return try await withTaskCancellationHandler {
            try await renderImpl(request, validatingWith: pipeline, options: options, cancellation: cancellation)
        } onCancel: {
            cancellation.cancel()
        }
    }

    private func renderImpl(_ request: RAWRenderRequest, validatingWith pipeline: PhotoPipeline,
                            options: Options, cancellation: LocalRetouchTiledRenderer.Cancellation) async throws -> Receipt {
        // Existing persisted inventory/Asset/Recipe/SHA validation is reused.
        try await pipeline.validateLargePrintSnapshot(request)
        try Task.checkCancellation()
        guard request.plan.format == .tiff,
              let encoding = try request.plan.parameters.exportSettings(), encoding.format == .tiff,
              encoding.tiffCompression == .none, !encoding.preserveAlpha,
              [8, 16].contains(encoding.bitDepth), encoding.requestedDPI == Double(options.dpi) else {
            throw Failure.unsupportedEncoding
        }
        // Do not silently strip a Recipe's metadata preservation requirement.
        guard encoding.metadata == .remove else { throw Failure.unsupportedMetadata }
        guard (1...10000).contains(options.dpi), options.widthMM.isFinite, options.heightMM.isFinite,
              options.widthMM > 0, options.heightMM > 0, options.widthMM <= 100000, options.heightMM <= 100000,
              (1...512).contains(options.rowsPerStrip), (32...4096).contains(options.tileWidth),
              (1024 * 1024...256 * 1024 * 1024).contains(options.bufferBudget),
              options.sourceDecodeAdmissionBytes > 0 else { throw Failure.invalidOptions }
        let pixels = try CropExportMath.requiredPixels(widthMM: options.widthMM, heightMM: options.heightMM, dpi: Double(options.dpi))
        guard pixels.width <= 1_000_000, pixels.height <= 1_000_000 else { throw Failure.bigTIFFRequired }
        if let crop = try request.plan.parameters.cropSettings(), let w = crop.widthMM, let h = crop.heightMM {
            guard abs(w-options.widthMM) < 0.001, abs(h-options.heightMM) < 0.001,
                  crop.requestedDPI == Double(options.dpi) else { throw Failure.invalidOptions }
        }
        let directory = request.destinationURL.deletingLastPathComponent()
        guard !FileManager.default.fileExists(atPath: request.destinationURL.path) else { throw Failure.destinationExists }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let colorName = encoding.colorSpace == .sRGB ? CGColorSpace.sRGB : CGColorSpace.adobeRGB1998
        guard let color = CGColorSpace(name: colorName), let iccCF = color.copyICCData() else { throw Failure.unsupportedEncoding }
        let icc = iccCF as Data
        let layout = try makeTIFF(width: pixels.width, height: pixels.height, bits: encoding.bitDepth,
                                  rows: options.rowsPerStrip, dpi: options.dpi, icc: icc)
        let sampleBytes = encoding.bitDepth / 8, stripRows = min(options.rowsPerStrip, pixels.height)
        let tileWidth = min(options.tileWidth, pixels.width), tileRowBytes = ((tileWidth * 4 * sampleBytes + 63) / 64) * 64
        let stripBytes = pixels.width * stripRows * 3 * sampleBytes, tileBytes = tileRowBytes * stripRows
        // Header Data + source ICC + offset/count arrays are separately accounted.
        let ownedBound = stripBytes + tileBytes + layout.header.count + icc.count + layout.offsets.count * 8 + 2 * 1024 * 1024
        guard ownedBound <= options.bufferBudget else { throw Failure.bufferBudget }
        let sourceSize = (try FileManager.default.attributesOfItem(atPath: request.originalURL.path)[.size] as? NSNumber)?.uint64Value ?? 0
        let capacity = try directory.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]).volumeAvailableCapacityForImportantUsage
        if let capacity, capacity >= 0, UInt64(capacity) < layout.total + sourceSize + 64 * 1024 * 1024 { throw Failure.diskSpace }
        let work = directory.appendingPathComponent(".suite-large-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: work, withIntermediateDirectories: false)
        defer { try? FileManager.default.removeItem(at: work) }
        // On-disk immutable snapshot prevents lazy decoder reads racing edits to
        // the original. It is never promoted to or substituted for Original.
        let source = work.appendingPathComponent("source").appendingPathExtension(request.originalURL.pathExtension)
        try FileManager.default.copyItem(at: request.originalURL, to: source)
        guard try digest(source) == request.plan.originalSHA256.lowercased() else { throw Failure.sourceIntegrity }
        let estimate = try sourceDecodeEstimate(source)
        guard estimate <= options.sourceDecodeAdmissionBytes,
              estimate <= ProcessInfo.processInfo.physicalMemory / 2 else { throw Failure.sourceDecodeBudget }
        try checkResources()
        let context = CIContext(options: [.cacheIntermediates: false, .useSoftwareRenderer: true,
                                         .workingFormat: CIFormat.RGBAf.rawValue,
                                         .workingColorSpace: CGColorSpace(name: CGColorSpace.extendedLinearSRGB)!])
        defer { context.clearCaches() }
        var image = try decode(source)
        let warpMask = try await pipeline.localWarpBodyMaskBytes(for: request.plan.parameters)
        try checkResources()
        image = try PhotoPipeline.applyNativeRecipe(request.plan.parameters, to: image,
            assetID: request.plan.assetID, originalSHA256: request.plan.originalSHA256,
            portraitPipeline: PortraitPipeline(context: context),
            tiledRetouchRenderer: LocalRetouchTiledRenderer(context: context, cancellation: cancellation),
            tiledWarpRenderer: LocalWarpTiledRenderer(context: context, cancellation: cancellation),
            warpBodyMaskBytes: warpMask)
        let prepared = try place(image, width: pixels.width, height: pixels.height, options: options)
        image = prepared.image
        let temporary = work.appendingPathComponent("output.tiff")
        guard FileManager.default.createFile(atPath: temporary.path, contents: nil) else { throw Failure.diskSpace }
        let file = try FileHandle(forWritingTo: temporary)
        defer { try? file.close() }
        try file.write(contentsOf: layout.header)
        let tile = UnsafeMutableRawPointer.allocate(byteCount: tileBytes, alignment: 64)
        let strip = UnsafeMutableRawPointer.allocate(byteCount: stripBytes, alignment: 64)
        defer { tile.deallocate(); strip.deallocate() }
        let format: CIFormat = encoding.bitDepth == 16 ? .RGBA16 : .RGBA8
        for (index, y) in stride(from: 0, to: pixels.height, by: options.rowsPerStrip).enumerated() {
            try checkResources()
            let rows = min(options.rowsPerStrip, pixels.height-y)
            try autoreleasepool {
                for x in stride(from: 0, to: pixels.width, by: tileWidth) {
                    try Task.checkCancellation()
                    let columns = min(tileWidth, pixels.width-x)
                    let destination = CIRenderDestination(bitmapData: tile, width: columns, height: rows,
                                                          bytesPerRow: tileRowBytes, format: format)
                    destination.colorSpace = color // Real Core Image output conversion, not ICC relabeling.
                    destination.isFlipped = true // top-to-bottom TIFF rows, orientation=1
                    destination.isClamped = true
                    let bounds = CGRect(x: x, y: pixels.height-y-rows, width: columns, height: rows)
                    let task = try context.startTask(toRender: image, from: bounds, to: destination, at: .zero)
                    _ = try task.waitUntilCompleted() // surface actual renderer failures
                    try Task.checkCancellation() // OS task itself may not be interruptible
                    for row in 0..<rows {
                        for column in 0..<columns {
                            let input = row*tileRowBytes + column*4*sampleBytes
                            let output = (row*pixels.width+x+column)*3*sampleBytes
                            if sampleBytes == 1 {
                                for c in 0..<3 { strip.storeBytes(of: tile.load(fromByteOffset: input+c, as: UInt8.self), toByteOffset: output+c, as: UInt8.self) }
                            } else {
                                for c in 0..<3 {
                                    let value = tile.load(fromByteOffset: input+c*2, as: UInt16.self).littleEndian
                                    strip.storeBytes(of: value, toByteOffset: output+c*2, as: UInt16.self)
                                }
                            }
                        }
                    }
                }
                guard try file.offset() == UInt64(layout.offsets[index]) else { throw Failure.unsupportedEncoding }
                // Data owns no extra pixel copy; strip stays alive through write.
                let bytes = Data(bytesNoCopy: strip, count: Int(layout.counts[index]), deallocator: .none)
                try file.write(contentsOf: bytes)
                if index+1 < layout.offsets.count, layout.counts[index] % 2 != 0 { try file.write(contentsOf: Data([0])) }
                context.clearCaches()
            }
        }
        guard try file.offset() == layout.total else { throw Failure.unsupportedEncoding }
        try file.synchronize(); try file.close(); try Task.checkCancellation()
        guard try digest(source) == request.plan.originalSHA256.lowercased() else { throw Failure.sourceIntegrity }
        // Keep the potentially long source read before the final saved-revision
        // check. The output remains a fixed snapshot, not a live view of edits.
        try await pipeline.validateLargePrintSnapshot(request)
        try Task.checkCancellation()
        // No replace: racing collisions fail without touching another Final.
        try FileManager.default.moveItem(at: temporary, to: request.destinationURL)
        return Receipt(file: request.destinationURL, width: pixels.width, height: pixels.height,
                       dpi: options.dpi, bitsPerSample: encoding.bitDepth, colorSpace: encoding.colorSpace,
                       byteCount: layout.total, writerOwnedPeakBufferBound: ownedBound,
                       sourceDecodeEstimateBytes: estimate, conventionalResamplingUsed: prepared.enlarged,
                       cancellationRequestedAfterCommit: Task.isCancelled)
    }

    private func checkResources() throws {
        try Task.checkCancellation()
        if ProcessInfo.processInfo.thermalState == .critical || ProcessInfo.processInfo.thermalState == .serious { throw Failure.resourcePressure }
    }
    private func digest(_ url: URL) throws -> String {
        let file = try FileHandle(forReadingFrom: url); defer { try? file.close() }; var hash = SHA256()
        while let chunk = try file.read(upToCount: 1024*1024), !chunk.isEmpty { try Task.checkCancellation(); hash.update(data: chunk) }
        return hash.finalize().map { String(format: "%02x", $0) }.joined()
    }
    private func sourceDecodeEstimate(_ url: URL) throws -> UInt64 {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary),
              let p = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let w = p[kCGImagePropertyPixelWidth] as? NSNumber, let h = p[kCGImagePropertyPixelHeight] as? NSNumber,
              w.int64Value > 0, h.int64Value > 0, w.int64Value <= 1_000_000, h.int64Value <= 1_000_000 else { throw Failure.unsupportedSource }
        return w.uint64Value * h.uint64Value * 32
    }
    private func decode(_ url: URL) throws -> CIImage {
        if let raw = CIRAWFilter(imageURL: url), let image = raw.outputImage { return normalized(image) }
        let rawExtensions: Set<String> = ["raw","dng","cr2","cr3","nef","nrw","arw","raf","rw2","orf","pef","srw"]
        guard UTType(filenameExtension: url.pathExtension)?.conforms(to: .rawImage) != true,
              !rawExtensions.contains(url.pathExtension.lowercased()),
              let source = CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary),
              let type = CGImageSourceGetType(source) as String?,
              [UTType.jpeg.identifier, UTType.png.identifier, UTType.heic.identifier, UTType.tiff.identifier].contains(type),
              let image = CIImage(contentsOf: url, options: [.applyOrientationProperty: true]) else { throw Failure.unsupportedSource }
        return normalized(image)
    }
    private func normalized(_ image: CIImage) -> CIImage {
        image.transformed(by: CGAffineTransform(translationX: -image.extent.minX, y: -image.extent.minY))
    }
    private func place(_ image: CIImage, width: Int, height: Int, options: Options) throws -> (image: CIImage, enlarged: Bool) {
        let extent = image.extent
        guard !extent.isInfinite, !extent.isEmpty, extent.width.isFinite, extent.height.isFinite else { throw Failure.unsupportedSource }
        let sx = Double(width)/extent.width, sy = Double(height)/extent.height
        let scale: Double, aspect: Double, enlargement: Double, dx: Double, dy: Double
        switch options.placement {
        case .requireMatchingAspect:
            // Match the requested physical ratio before integer-pixel rounding.
            // A uniform fit to rounded dimensions would introduce a thin white
            // margin. Only the sub-pixel quantization difference is absorbed.
            let physicalRatio = options.widthMM / options.heightMM
            // Same ratio tolerance as CropExportMath.resolutionAssessment,
            // rather than a stricter gate than the native crop UI permits.
            guard abs(extent.width / extent.height - physicalRatio) <= 1e-6 * max(1, physicalRatio) else {
                throw Failure.aspectMismatch
            }
            scale = sy; aspect = sx/sy; enlargement = max(sx,sy); dx = 0; dy = 0
        case .fitWhiteMargins:
            scale = min(sx,sy); aspect = 1; enlargement = scale
            dx = (Double(width)-extent.width*scale)/2; dy = (Double(height)-extent.height*scale)/2
        case .fillCrop(let x, let y):
            guard x.isFinite, y.isFinite, (0...1).contains(x), (0...1).contains(y) else { throw Failure.invalidOptions }
            scale = max(sx,sy); aspect = 1; enlargement = scale
            dx = (Double(width)-extent.width*scale)*x; dy = (Double(height)-extent.height*scale)*(1-y)
        }
        if enlargement > 1.000001, case .rejectInsufficient = options.upscale { throw Failure.insufficientResolution }
        // Ordinary high-quality resampling is explicit; it adds pixels, not detail.
        let scaled = image.applyingFilter("CILanczosScaleTransform", parameters: [kCIInputScaleKey: scale, kCIInputAspectRatioKey: aspect])
            .transformed(by: CGAffineTransform(translationX: dx, y: dy))
        let bounds = CGRect(x: 0, y: 0, width: width, height: height)
        let white = CIImage(color: CIColor(red: 1, green: 1, blue: 1)).cropped(to: bounds)
        return (scaled.composited(over: white).cropped(to: bounds), enlargement > 1.000001)
    }

    private func makeTIFF(width: Int, height: Int, bits: Int, rows: Int, dpi: Int, icc: Data) throws -> TIFFLayout {
        guard icc.count >= 132, icc.count <= 4*1024*1024 else { throw Failure.unsupportedEncoding }
        let strips = (height+rows-1)/rows, entries = 16
        var cursor = 8+2+entries*12+4
        func reserve(_ count: Int) -> Int { cursor += cursor%2; let start = cursor; cursor += count; return start }
        let bitsAt = reserve(6), samplesAt = reserve(6)
        let offsetsAt = strips > 1 ? reserve(strips*4) : 0, countsAt = strips > 1 ? reserve(strips*4) : 0
        let xDPI = reserve(8), yDPI = reserve(8), iccAt = reserve(icc.count)
        cursor += cursor%2
        guard cursor < 8*1024*1024 else { throw Failure.bufferBudget }
        let rowBytes = width*3*(bits/8)
        var next = UInt64(cursor), offsets: [UInt32] = [], counts: [UInt32] = []
        for index in 0..<strips {
            let count = UInt64(min(rows,height-index*rows)*rowBytes)
            guard next+count <= UInt64(UInt32.max) else { throw Failure.bigTIFFRequired }
            offsets.append(UInt32(next)); counts.append(UInt32(count)); next += count
            if index+1 < strips { next += next%2 }
        }
        guard next <= UInt64(UInt32.max) else { throw Failure.bigTIFFRequired }
        var data = Data(count: cursor)
        func short(_ at: Int, _ value: UInt16) { data[at] = UInt8(truncatingIfNeeded: value); data[at+1] = UInt8(truncatingIfNeeded: value >> 8) }
        func long(_ at: Int, _ value: UInt32) { for i in 0..<4 { data[at+i] = UInt8(truncatingIfNeeded: value >> (8*i)) } }
        data[0] = 0x49; data[1] = 0x49; short(2,42); long(4,8); short(8,UInt16(entries))
        let fields: [(UInt16,UInt16,UInt32,UInt32)] = [
            (256,4,1,UInt32(width)), (257,4,1,UInt32(height)), (258,3,3,UInt32(bitsAt)),
            (259,3,1,1), (262,3,1,2), (273,4,UInt32(strips),strips == 1 ? offsets[0] : UInt32(offsetsAt)),
            (274,3,1,1), (277,3,1,3), (278,4,1,UInt32(rows)),
            (279,4,UInt32(strips),strips == 1 ? counts[0] : UInt32(countsAt)),
            (282,5,1,UInt32(xDPI)), (283,5,1,UInt32(yDPI)), (284,3,1,1), (296,3,1,2),
            (339,3,3,UInt32(samplesAt)), (34675,7,UInt32(icc.count),UInt32(iccAt))]
        for (index, field) in fields.enumerated() {
            let at = 10+index*12; short(at,field.0); short(at+2,field.1); long(at+4,field.2)
            if field.1 == 3 && field.2 == 1 { short(at+8,UInt16(field.3)) } else { long(at+8,field.3) }
        }
        long(10+entries*12,0)
        for channel in 0..<3 { short(bitsAt+channel*2,UInt16(bits)); short(samplesAt+channel*2,1) }
        long(xDPI,UInt32(dpi)); long(xDPI+4,1); long(yDPI,UInt32(dpi)); long(yDPI+4,1)
        if strips > 1 { for index in 0..<strips { long(offsetsAt+index*4,offsets[index]); long(countsAt+index*4,counts[index]) } }
        data.replaceSubrange(iccAt..<iccAt+icc.count, with: icc)
        return TIFFLayout(header: data, offsets: offsets, counts: counts, total: next)
    }
}
