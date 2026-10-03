import Foundation

/// Data/calculation support is not renderer, color fidelity, or device certification.
public enum CropOrientation: String, Codable, CaseIterable, Sendable { case portrait, landscape }
public struct CropRatio: Codable, Equatable, Sendable {
    public var width: Double
    public var height: Double
    public init(width: Double, height: Double) { self.width = width; self.height = height }
    private enum CodingKeys: String, CodingKey, CaseIterable { case width, height }
    public init(from decoder: any Decoder) throws {
        try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
        let c = try decoder.container(keyedBy: CodingKeys.self)
        width = try c.decode(Double.self, forKey: .width); height = try c.decode(Double.self, forKey: .height)
        try validate()
    }
    public func encode(to encoder: any Encoder) throws {
        try validate(); var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(width, forKey: .width); try c.encode(height, forKey: .height)
    }
    public func validate() throws {
        guard width.isFinite, height.isFinite, width > 0, height > 0,
              (width / height).isFinite, width / height > 0 else { throw SuiteValidationError.invalidValue("cropRatio") }
    }
}
public struct NormalizedCropRect: Codable, Equatable, Sendable {
    public var x: Double
    public var y: Double
    public var width: Double
    public var height: Double
    public static let full = Self(x: 0, y: 0, width: 1, height: 1)
    public init(x: Double, y: Double, width: Double, height: Double) {
        self.x = x; self.y = y; self.width = width; self.height = height
    }
    private enum CodingKeys: String, CodingKey, CaseIterable { case x, y, width, height }
    public init(from decoder: any Decoder) throws {
        try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
        let c = try decoder.container(keyedBy: CodingKeys.self)
        x = try c.decode(Double.self, forKey: .x); y = try c.decode(Double.self, forKey: .y)
        width = try c.decode(Double.self, forKey: .width); height = try c.decode(Double.self, forKey: .height)
        try validate()
    }
    public func encode(to encoder: any Encoder) throws {
        try validate(); var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(x, forKey: .x); try c.encode(y, forKey: .y)
        try c.encode(width, forKey: .width); try c.encode(height, forKey: .height)
    }
    public func validate() throws {
        guard x.isFinite, y.isFinite, width.isFinite, height.isFinite,
              x >= 0, y >= 0, width > 0, height > 0,
              x + width <= 1 + 1e-12, y + height <= 1 + 1e-12 else { throw SuiteValidationError.invalidValue("cropRect") }
    }
}
public struct CropSettings: Codable, Equatable, Sendable {
    public var presetID: String
    public var presetName: String
    public var widthMM: Double?
    public var heightMM: Double?
    public var orientation: CropOrientation
    /// Top-left normalized rect in the EXIF-upright, recipe-rotated image.
    public var cropRect: NormalizedCropRect
    public var cropRatio: CropRatio?
    /// Copy of RecipeParameters.rotationDegrees, never a second rotation.
    public var rotation: Int
    public var customSize: Bool
    public var requestedDPI: Double
    public init(presetID: String = "ratio.original", presetName: String = "Original",
                widthMM: Double? = nil, heightMM: Double? = nil, orientation: CropOrientation = .landscape,
                cropRect: NormalizedCropRect = .full, cropRatio: CropRatio? = nil,
                rotation: Int = 0, customSize: Bool = false, requestedDPI: Double = 300) {
        self.presetID = presetID; self.presetName = presetName; self.widthMM = widthMM; self.heightMM = heightMM
        self.orientation = orientation; self.cropRect = cropRect; self.cropRatio = cropRatio
        self.rotation = rotation; self.customSize = customSize; self.requestedDPI = requestedDPI
    }
    public func validate() throws {
        guard !presetID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !presetName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              (-9_007_199_254_740_991...9_007_199_254_740_991).contains(rotation),
              rotation % 90 == 0, requestedDPI.isFinite, requestedDPI > 0,
              (widthMM == nil) == (heightMM == nil) else { throw SuiteValidationError.invalidValue("cropSettings") }
        try cropRect.validate(); try cropRatio?.validate()
        if let widthMM, let heightMM {
            guard widthMM.isFinite, heightMM.isFinite, widthMM > 0, heightMM > 0,
                  let ratio = cropRatio,
                  abs(widthMM / heightMM - ratio.width / ratio.height) <= 1e-9,
                  (orientation == .portrait ? widthMM <= heightMM : widthMM >= heightMM) else {
                throw SuiteValidationError.invalidValue("cropPhysicalSize")
            }
            _ = try CropExportMath.requiredPixels(widthMM: widthMM, heightMM: heightMM, dpi: requestedDPI)
        } else if customSize { throw SuiteValidationError.invalidValue("cropCustomSize") }
        if let preset = PrintPresetCatalog.presets.first(where: { $0.id == presetID }) {
            guard preset.available, !customSize, let w = preset.widthMM, let h = preset.heightMM,
                  widthMM == (orientation == .portrait ? min(w, h) : max(w, h)),
                  heightMM == (orientation == .portrait ? max(w, h) : min(w, h)) else {
                throw SuiteValidationError.invalidValue("cropPresetDimensions")
            }
        }
    }
    private enum CodingKeys: String, CodingKey, CaseIterable {
        case presetID = "preset_id", presetName = "preset_name", widthMM = "width_mm", heightMM = "height_mm"
        case orientation, cropRect = "crop_rect", cropRatio = "crop_ratio", rotation
        case customSize = "custom_size", requestedDPI = "requested_dpi"
    }
    public init(from decoder: any Decoder) throws {
        try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
        let c = try decoder.container(keyedBy: CodingKeys.self)
        presetID = try c.decode(String.self, forKey: .presetID); presetName = try c.decode(String.self, forKey: .presetName)
        widthMM = try c.decodeIfPresent(Double.self, forKey: .widthMM); heightMM = try c.decodeIfPresent(Double.self, forKey: .heightMM)
        orientation = try c.decode(CropOrientation.self, forKey: .orientation)
        cropRect = try c.decode(NormalizedCropRect.self, forKey: .cropRect)
        cropRatio = try c.decodeIfPresent(CropRatio.self, forKey: .cropRatio)
        rotation = try c.decode(Int.self, forKey: .rotation); customSize = try c.decode(Bool.self, forKey: .customSize)
        requestedDPI = try c.decode(Double.self, forKey: .requestedDPI)
        for key in [CodingKeys.widthMM, .heightMM, .cropRatio] {
            if c.contains(key), try c.decodeNil(forKey: key) { throw SuiteValidationError.invalidValue("cropNull") }
        }
        try validate()
    }
    public func encode(to encoder: any Encoder) throws {
        try validate(); var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(presetID, forKey: .presetID); try c.encode(presetName, forKey: .presetName)
        try c.encodeIfPresent(widthMM, forKey: .widthMM); try c.encodeIfPresent(heightMM, forKey: .heightMM)
        try c.encode(orientation, forKey: .orientation); try c.encode(cropRect, forKey: .cropRect)
        try c.encodeIfPresent(cropRatio, forKey: .cropRatio); try c.encode(rotation, forKey: .rotation)
        try c.encode(customSize, forKey: .customSize); try c.encode(requestedDPI, forKey: .requestedDPI)
    }
}
public enum CropExportFormat: String, Codable, CaseIterable, Sendable { case jpeg, tiff, png }
public enum ExportColorSpace: String, Codable, CaseIterable, Sendable { case sRGB, adobeRGB }
public enum TIFFCompression: String, Codable, CaseIterable, Sendable { case none, lzw }
public enum ExportMetadataPolicy: String, Codable, CaseIterable, Sendable { case preserve, remove }
public struct ExportSettings: Codable, Equatable, Sendable {
    public var format: CropExportFormat
    public var jpegQuality: Int
    public var bitDepth: Int
    public var colorSpace: ExportColorSpace
    public var tiffCompression: TIFFCompression
    public var preserveAlpha: Bool
    public var metadata: ExportMetadataPolicy
    public var fileNameTemplate: String
    public var requestedDPI: Double
    public init(format: CropExportFormat = .jpeg, jpegQuality: Int = 100, bitDepth: Int = 8,
                colorSpace: ExportColorSpace = .sRGB, tiffCompression: TIFFCompression = .none,
                preserveAlpha: Bool = false, metadata: ExportMetadataPolicy = .preserve,
                fileNameTemplate: String = "{original}-{sequence}", requestedDPI: Double = 300) {
        self.format = format; self.jpegQuality = jpegQuality; self.bitDepth = bitDepth; self.colorSpace = colorSpace
        self.tiffCompression = tiffCompression; self.preserveAlpha = preserveAlpha; self.metadata = metadata
        self.fileNameTemplate = fileNameTemplate; self.requestedDPI = requestedDPI
    }
    public func validate() throws {
        let stripped = fileNameTemplate.replacingOccurrences(of: "{original}", with: "").replacingOccurrences(of: "{sequence}", with: "")
        let forbidden = CharacterSet(charactersIn: "\\/:*?\"<>|{}").union(.controlCharacters)
        guard (1...100).contains(jpegQuality), [8, 16].contains(bitDepth),
              requestedDPI.isFinite, requestedDPI > 0,
              !fileNameTemplate.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              fileNameTemplate.utf16.count <= 128, !fileNameTemplate.contains(".."),
              stripped.rangeOfCharacter(from: forbidden) == nil else { throw SuiteValidationError.invalidValue("exportSettings") }
        guard format != .jpeg || (bitDepth == 8 && !preserveAlpha),
              format == .tiff || tiffCompression == .none else { throw SuiteValidationError.invalidValue("exportFormatSettings") }
    }
    private enum CodingKeys: String, CodingKey, CaseIterable {
        case format, jpegQuality = "jpeg_quality", bitDepth = "bit_depth", colorSpace = "color_space"
        case tiffCompression = "tiff_compression", preserveAlpha = "preserve_alpha", metadata
        case fileNameTemplate = "file_name_template", requestedDPI = "requested_dpi"
    }
    public init(from decoder: any Decoder) throws {
        try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
        let c = try decoder.container(keyedBy: CodingKeys.self)
        format = try c.decode(CropExportFormat.self, forKey: .format)
        jpegQuality = try c.decode(Int.self, forKey: .jpegQuality); bitDepth = try c.decode(Int.self, forKey: .bitDepth)
        colorSpace = try c.decode(ExportColorSpace.self, forKey: .colorSpace)
        tiffCompression = try c.decode(TIFFCompression.self, forKey: .tiffCompression)
        preserveAlpha = try c.decode(Bool.self, forKey: .preserveAlpha)
        metadata = try c.decode(ExportMetadataPolicy.self, forKey: .metadata)
        fileNameTemplate = try c.decode(String.self, forKey: .fileNameTemplate)
        requestedDPI = try c.decode(Double.self, forKey: .requestedDPI)
        try validate()
    }
    public func encode(to encoder: any Encoder) throws {
        try validate(); var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(format, forKey: .format); try c.encode(jpegQuality, forKey: .jpegQuality)
        try c.encode(bitDepth, forKey: .bitDepth); try c.encode(colorSpace, forKey: .colorSpace)
        try c.encode(tiffCompression, forKey: .tiffCompression); try c.encode(preserveAlpha, forKey: .preserveAlpha)
        try c.encode(metadata, forKey: .metadata); try c.encode(fileNameTemplate, forKey: .fileNameTemplate)
        try c.encode(requestedDPI, forKey: .requestedDPI)
    }
}
public struct CropExportPreset: Identifiable, Equatable, Sendable {
    public let id: String
    public let name: String
    public let settings: ExportSettings
    public let suggestedRatioIDs: [String]
    public let notes: String
}
public enum ExportPresetCatalog {
    /// Recommendations only. Never bypass renderer capability validation or alter Original.
    public static let presets: [CropExportPreset] = [
        .init(id: "export.web-sns", name: "Web / SNS", settings: .init(),
              suggestedRatioIDs: ["ratio.1:1", "ratio.4:5", "ratio.16:9", "ratio.9:16"],
              notes: "JPEG品質100・sRGB。比率は候補のみ、自動Crop変更なし。Webアプリ実装ではない。"),
        .init(id: "export.standard-print", name: "Standard Print", settings: .init(),
              suggestedRatioIDs: [], notes: "JPEG品質100・300dpi。Crop実寸を使用し必要pixelを再確認。"),
        .init(id: "export.fine-art", name: "Fine Art", settings: .init(format: .tiff, bitDepth: 16, colorSpace: .adobeRGB),
              suggestedRatioIDs: [], notes: "TIFF16・AdobeRGB・300dpiの候補。実エンジンで未対応なら拒否。"),
        .init(id: "export.graphic-text", name: "Graphic / Text PNG", settings: .init(format: .png, preserveAlpha: true),
              suggestedRatioIDs: [], notes: "PNG・Alpha保持。入力にない透過を生成する機能ではない。")
    ]
}
public struct PixelDimensions: Codable, Equatable, Sendable {
    public let width: Int
    public let height: Int
    public init(width: Int, height: Int) { self.width = width; self.height = height }
}
public struct ResolutionAssessment: Equatable, Sendable {
    public let required: PixelDimensions?
    public let available: PixelDimensions
    public let shortfallPercent: Double
    public let recommendedDPI: Double?
    public let needsUpscale: Bool
}
public enum CropExportMath {
    private static func dimension(_ value: Double) throws -> Int {
        guard value.isFinite, value > 0, value <= 9_007_199_254_740_991, value.rounded(.down) == value else {
            throw SuiteValidationError.invalidValue("pixelDimension")
        }
        return Int(value)
    }
    public static func requiredPixels(widthMM: Double, heightMM: Double, dpi: Double = 300) throws -> PixelDimensions {
        guard widthMM.isFinite, heightMM.isFinite, dpi.isFinite, widthMM > 0, heightMM > 0, dpi > 0 else {
            throw SuiteValidationError.invalidValue("printDimension")
        }
        return try .init(width: dimension(ceil(widthMM / 25.4 * dpi)), height: dimension(ceil(heightMM / 25.4 * dpi)))
    }
    public static func centeredRect(sourceWidth: Int, sourceHeight: Int, ratio: CropRatio) throws -> NormalizedCropRect {
        _ = try dimension(Double(sourceWidth)); _ = try dimension(Double(sourceHeight)); try ratio.validate()
        let target = ratio.width / ratio.height, source = Double(sourceWidth) / Double(sourceHeight)
        let width = min(1, target / source), height = min(1, source / target)
        let rect = NormalizedCropRect(x: (1 - width) / 2, y: (1 - height) / 2, width: width, height: height)
        try rect.validate(); return rect
    }
    /// source dimensions are EXIF-upright BEFORE recipe rotation. The crop is in rotated coordinates.
    public static func resolutionAssessment(sourceWidth: Int, sourceHeight: Int, crop: CropSettings) throws -> ResolutionAssessment {
        _ = try dimension(Double(sourceWidth)); _ = try dimension(Double(sourceHeight)); try crop.validate()
        let swap = abs(crop.rotation % 180) == 90
        let width = Double(swap ? sourceHeight : sourceWidth), height = Double(swap ? sourceWidth : sourceHeight)
        let available = try PixelDimensions(width: dimension(floor(width * crop.cropRect.width + 1e-9)),
                                            height: dimension(floor(height * crop.cropRect.height + 1e-9)))
        if let ratio = crop.cropRatio {
            let actual = width * crop.cropRect.width / (height * crop.cropRect.height), target = ratio.width / ratio.height
            guard abs(actual - target) <= 1e-6 * max(1, target) else { throw SuiteValidationError.invalidValue("cropRectRatioMismatch") }
        }
        guard let widthMM = crop.widthMM, let heightMM = crop.heightMM else {
            return .init(required: nil, available: available, shortfallPercent: 0, recommendedDPI: nil, needsUpscale: false)
        }
        let required = try requiredPixels(widthMM: widthMM, heightMM: heightMM, dpi: crop.requestedDPI)
        let fraction = min(1, min(Double(available.width) / Double(required.width), Double(available.height) / Double(required.height)))
        let dpi = floor(min(Double(available.width) * 25.4 / widthMM, Double(available.height) * 25.4 / heightMM))
        return .init(required: required, available: available, shortfallPercent: (1 - fraction) * 100, recommendedDPI: dpi,
                     needsUpscale: available.width < required.width || available.height < required.height)
    }
    /// Uncompressed pixel buffer only, never a promised JPEG size or process peak memory.
    public static func estimatedUncompressedBytes(pixels: PixelDimensions, settings: ExportSettings) throws -> Int {
        _ = try dimension(Double(pixels.width)); _ = try dimension(Double(pixels.height)); try settings.validate()
        return try dimension(Double(pixels.width) * Double(pixels.height) * (settings.preserveAlpha ? 4 : 3) * Double(settings.bitDepth) / 8)
    }
}
public struct CropRatioPreset: Identifiable, Equatable, Sendable {
    public let id: String
    public let name: String
    public let ratio: CropRatio?
}
public enum RatioCatalog {
    public static let presets: [CropRatioPreset] = [
        .init(id: "ratio.original", name: "Original", ratio: nil), .init(id: "ratio.free", name: "Free", ratio: nil),
        .init(id: "ratio.1:1", name: "1:1", ratio: .init(width: 1, height: 1)),
        .init(id: "ratio.3:2", name: "3:2", ratio: .init(width: 3, height: 2)),
        .init(id: "ratio.2:3", name: "2:3", ratio: .init(width: 2, height: 3)),
        .init(id: "ratio.4:3", name: "4:3", ratio: .init(width: 4, height: 3)),
        .init(id: "ratio.3:4", name: "3:4", ratio: .init(width: 3, height: 4)),
        .init(id: "ratio.5:4", name: "5:4", ratio: .init(width: 5, height: 4)),
        .init(id: "ratio.4:5", name: "4:5", ratio: .init(width: 4, height: 5)),
        .init(id: "ratio.16:9", name: "16:9", ratio: .init(width: 16, height: 9)),
        .init(id: "ratio.9:16", name: "9:16", ratio: .init(width: 9, height: 16)),
        .init(id: "ratio.custom", name: "Custom Ratio", ratio: nil)
    ]
}
public enum PrintPresetCategory: String, Codable, CaseIterable, Sendable { case aSeries, bSeries, photoPrint }
public struct PrintPreset: Identifiable, Codable, Equatable, Sendable {
    public let id: String
    public let name: String
    public let category: PrintPresetCategory
    public let widthMM: Double?
    public let heightMM: Double?
    public let sourceURL: String?
    public let available: Bool
    public let notes: String
    public let checkedAt: String
    public init(id: String, name: String, category: PrintPresetCategory, widthMM: Double?, heightMM: Double?,
                sourceURL: String?, notes: String = "", checkedAt: String = "2026-10-03") {
        self.id = id; self.name = name; self.category = category; self.widthMM = widthMM; self.heightMM = heightMM
        self.sourceURL = sourceURL; self.notes = notes; self.checkedAt = checkedAt
        available = widthMM != nil && heightMM != nil && sourceURL != nil
    }
    private enum CodingKeys: String, CodingKey {
        case id, name, category, widthMM = "width_mm", heightMM = "height_mm", sourceURL = "source_url", available, notes, checkedAt = "checked_at"
    }
}
public enum PrintPresetCatalog {
    /// Same values as contracts/fixtures/print-presets.json; Swift fixture test guards drift.
    public static let presets: [PrintPreset] = [
        .init(id: "a.a0-double", name: "A0倍", category: .aSeries, widthMM: 1189, heightMM: 1682, sourceURL: "https://www.graphic.jp/lineup/poster_xl", notes: "A0とは別ID。印刷所のA0倍仕上がり寸法。"),
        .init(id: "a.a0", name: "A0", category: .aSeries, widthMM: 841, heightMM: 1189, sourceURL: "https://www.yutakaprint.co.jp/papersize/", notes: ""),
        .init(id: "a.a1", name: "A1", category: .aSeries, widthMM: 594, heightMM: 841, sourceURL: "https://www.yutakaprint.co.jp/papersize/", notes: ""),
        .init(id: "a.a2", name: "A2", category: .aSeries, widthMM: 420, heightMM: 594, sourceURL: "https://www.yutakaprint.co.jp/papersize/", notes: ""),
        .init(id: "a.a3", name: "A3", category: .aSeries, widthMM: 297, heightMM: 420, sourceURL: "https://www.yutakaprint.co.jp/papersize/", notes: ""),
        .init(id: "a.a4", name: "A4", category: .aSeries, widthMM: 210, heightMM: 297, sourceURL: "https://www.yutakaprint.co.jp/papersize/", notes: ""),
        .init(id: "a.a5", name: "A5", category: .aSeries, widthMM: 148, heightMM: 210, sourceURL: "https://www.yutakaprint.co.jp/papersize/", notes: ""),
        .init(id: "a.a6", name: "A6", category: .aSeries, widthMM: 105, heightMM: 148, sourceURL: "https://www.yutakaprint.co.jp/papersize/", notes: ""),
        .init(id: "b.b0-double", name: "B0倍", category: .bSeries, widthMM: 1456, heightMM: 2060, sourceURL: "https://www.graphic.jp/lineup/poster_xl", notes: "B0とは別ID。JIS B系の印刷所B0倍。ISO Bと混同しない。"),
        .init(id: "b.b0", name: "B0", category: .bSeries, widthMM: 1030, heightMM: 1456, sourceURL: "https://www.yutakaprint.co.jp/papersize/", notes: "日本向けJIS B寸法。"),
        .init(id: "b.b1", name: "B1", category: .bSeries, widthMM: 728, heightMM: 1030, sourceURL: "https://www.yutakaprint.co.jp/papersize/", notes: "日本向けJIS B寸法。"),
        .init(id: "b.b2", name: "B2", category: .bSeries, widthMM: 515, heightMM: 728, sourceURL: "https://www.yutakaprint.co.jp/papersize/", notes: "日本向けJIS B寸法。"),
        .init(id: "b.b3", name: "B3", category: .bSeries, widthMM: 364, heightMM: 515, sourceURL: "https://www.yutakaprint.co.jp/papersize/", notes: "日本向けJIS B寸法。"),
        .init(id: "b.b4", name: "B4", category: .bSeries, widthMM: 257, heightMM: 364, sourceURL: "https://www.yutakaprint.co.jp/papersize/", notes: "日本向けJIS B寸法。"),
        .init(id: "b.b5", name: "B5", category: .bSeries, widthMM: 182, heightMM: 257, sourceURL: "https://www.yutakaprint.co.jp/papersize/", notes: "日本向けJIS B寸法。"),
        .init(id: "b.b6", name: "B6", category: .bSeries, widthMM: 128, heightMM: 182, sourceURL: "https://www.yutakaprint.co.jp/papersize/", notes: "日本向けJIS B寸法。"),
        .init(id: "photo.l", name: "L", category: .photoPrint, widthMM: 89, heightMM: 127, sourceURL: "https://netprint-smile.com/netprint.html", notes: "提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。"),
        .init(id: "photo.2l", name: "2L", category: .photoPrint, widthMM: 127, heightMM: 178, sourceURL: "https://netprint-smile.com/netprint.html", notes: "提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。"),
        .init(id: "photo.dsc", name: "DSC", category: .photoPrint, widthMM: 89, heightMM: 119, sourceURL: "https://netprint-smile.com/netprint.html", notes: "提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。"),
        .init(id: "photo.dscw", name: "DSCW", category: .photoPrint, widthMM: 127, heightMM: 169, sourceURL: "https://ikb135.onlinelab.jp/help/faq/print.php", notes: "提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。"),
        .init(id: "photo.kg", name: "KG", category: .photoPrint, widthMM: 102, heightMM: 152, sourceURL: "https://netprint-smile.com/netprint.html", notes: "提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。"),
        .init(id: "photo.postcard", name: "はがき", category: .photoPrint, widthMM: 100, heightMM: 148, sourceURL: "https://www2.epson.jp/support/manual/data/ink/scpx7v2/CMP0038_00.PDF", notes: "郵便はがき100×148mm。KG 102×152mmとは別ID。"),
        .init(id: "photo.hv", name: "HV", category: .photoPrint, widthMM: 89, heightMM: 158, sourceURL: "https://netprint-smile.com/netprint.html", notes: "89×158mmを提供する写真のスマイルの候補。他のHV用紙とは寸法が異なる。"),
        .init(id: "photo.square", name: "スクエア", category: .photoPrint, widthMM: 89, heightMM: 89, sourceURL: "https://netprint-smile.com/netprint.html", notes: "89mm正方形の候補。スクエアは寸法を一意に決める名称ではない。"),
        .init(id: "photo.panorama", name: "パノラマ", category: .photoPrint, widthMM: 89, heightMM: 254, sourceURL: "https://netprint-smile.com/netprint.html", notes: "提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。"),
        .init(id: "photo.cabinet", name: "キャビネ", category: .photoPrint, widthMM: 127, heightMM: 178, sourceURL: "https://www.tomicolor.co.jp/services/print/largeprint/", notes: "トミカラーの提供実寸を採用した候補。名称が同じでもラボ差あり。注文先の実寸を確認しCustom Sizeで変更。"),
        .init(id: "photo.8cut", name: "八切", category: .photoPrint, widthMM: 165, heightMM: 216, sourceURL: "https://www.tomicolor.co.jp/services/print/largeprint/", notes: "提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。"),
        .init(id: "photo.6cut", name: "六切", category: .photoPrint, widthMM: 203, heightMM: 254, sourceURL: "https://www.tomicolor.co.jp/services/print/largeprint/", notes: "提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。"),
        .init(id: "photo.wide6", name: "ワイド六切", category: .photoPrint, widthMM: 203, heightMM: 305, sourceURL: "https://www.tomicolor.co.jp/services/print/largeprint/", notes: "提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。"),
        .init(id: "photo.4cut", name: "四切", category: .photoPrint, widthMM: 254, heightMM: 305, sourceURL: "https://www.tomicolor.co.jp/services/print/largeprint/", notes: "提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。"),
        .init(id: "photo.wide4", name: "ワイド四切", category: .photoPrint, widthMM: 254, heightMM: 381, sourceURL: "https://www.tomicolor.co.jp/services/print/largeprint/", notes: "トミカラーの提供実寸を採用した候補。名称が同じでもラボ差あり。注文先の実寸を確認しCustom Sizeで変更。"),
        .init(id: "photo.large4", name: "大四切", category: .photoPrint, widthMM: 279, heightMM: 356, sourceURL: "https://www.tomicolor.co.jp/services/print/largeprint/", notes: "提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。"),
        .init(id: "photo.half", name: "半切", category: .photoPrint, widthMM: 356, heightMM: 432, sourceURL: "https://www.tomicolor.co.jp/services/print/largeprint/", notes: "トミカラーの提供実寸を採用した候補。名称が同じでもラボ差あり。注文先の実寸を確認しCustom Sizeで変更。"),
        .init(id: "photo.full", name: "全紙", category: .photoPrint, widthMM: 457, heightMM: 560, sourceURL: "https://www.tomicolor.co.jp/services/print/largeprint/", notes: "トミカラーの提供実寸を採用した候補。名称が同じでもラボ差あり。注文先の実寸を確認しCustom Sizeで変更。"),
        .init(id: "photo.largefull", name: "大全紙", category: .photoPrint, widthMM: 508, heightMM: 600, sourceURL: "https://www.tomicolor.co.jp/services/print/largeprint/", notes: "トミカラーの提供実寸を採用した候補。名称が同じでもラボ差あり。注文先の実寸を確認しCustom Sizeで変更。"),
        .init(id: "photo.doublefull", name: "全倍", category: .photoPrint, widthMM: 540, heightMM: 840, sourceURL: "https://www.tomicolor.co.jp/services/print/largeprint/", notes: "トミカラーの提供実寸を採用した候補。名称が同じでもラボ差あり。注文先の実寸を確認しCustom Sizeで変更。"),
        .init(id: "photo.a3plus", name: "A3ノビ", category: .photoPrint, widthMM: 329, heightMM: 483, sourceURL: "https://www.epson.jp/products/colorio/supply/paper/use/pro.htm", notes: "提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。")
    ]
}
