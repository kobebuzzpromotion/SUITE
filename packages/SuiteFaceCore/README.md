# SuiteFaceCore

Local CPU face inference kernel, C ABI v1. OpenCV **4.13.0** is required at configure and compile time. No network, model download, fake detector, cloud fallback, identity database or automatic identity acceptance is implemented here.

## Integration contract

1. The application verifies the pinned YuNet 2023mar and SFace 2021dec files (length and SHA-256), keeps their installed location immutable, and retains model digests beside features. `sf_create` loads this pair once; it does not validate hashes itself.
2. Prepare an upright, unmirrored BGR8 analysis image. Retain its original SHA, analysis digest and inverse transform outside this kernel. Never pass RGBA, RGB, premultiplied pixels or uncorrected EXIF orientation. `stride * height` readable bytes are required including final-row padding.
3. Call `sf_analyze` with an application-selected pixel admission budget. It invokes YuNet then SFace `alignCrop` and `feature` for each detection. A zero-face image is a successful empty result, not a fabricated person. Unexpected model shape/invalid values fail the whole request rather than silently omitting faces. This kernel produces five alignment landmarks, not a face mesh or skin/body mask.
4. Copy face rows and features using getters, then destroy the result. No C++ memory is borrowed by Swift. Results can outlive their context. Do not destroy a result while another call reads it.
5. The caller establishes the same SFace version for both features before `sf_match_cosine`. No calibrated identity threshold is provided. Registration consent, ambiguity/margin, manual confirmation, encryption and persistence remain application responsibilities.

Context inference and matching calls serialize through an instance mutex. Do not race destruction against calls. There is no mid-inference cancellation: a queue must check cancellation before dispatch and discard cancelled/stale results afterward. Avoid dispatching synchronous inference on the UI thread. Pixel admission limits input dimensions, not all OpenCV internal memory or thermal use; device policy and bounded queues remain necessary.

## Build definition (not executed)

Use CMake with `OpenCV_DIR` pointing to the matching target SDK/architecture's OpenCV 4.13.0 config. Required modules: core, imgproc, dnn, objdetect. Build exceptions enabled. The output is a static archive plus a C header/module map. No OpenCV binary is vendored or downloaded by CMake. Apple device/simulator archives and XCFramework packaging, dependent OpenCV libraries/frameworks, signing and Xcode integration are subsequent work. This directory is not by itself an installable Swift package.

All OpenCV/model/dependency license and NOTICE obligations must be included by the distributing application. No claim of completed license packaging is made.

## Primary API references

- [OpenCV 4.13 FaceDetectorYN](https://docs.opencv.org/4.13.0/df/d20/classcv_1_1FaceDetectorYN.html)
- [OpenCV 4.13 FaceRecognizerSF](https://docs.opencv.org/4.13.0/da/d09/classcv_1_1FaceRecognizerSF.html)
- [Fixed 4.13 recognition implementation](https://github.com/opencv/opencv/blob/4.13.0/modules/objdetect/src/face_recognize.cpp)

The recognition implementation handles BGR-to-RGB conversion internally. Do not swap channels before passing BGR input. Matching copies vectors because OpenCV normalizes them in place.

Status: code authored 2026-10-11; no compilation, model execution, photo test, performance/quality measurement or Apple device validation performed.
