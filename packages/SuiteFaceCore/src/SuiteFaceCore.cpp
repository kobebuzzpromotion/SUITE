#include "SuiteFaceCore.h"
#include <opencv2/core.hpp>
#include <opencv2/core/version.hpp>
#include <opencv2/dnn.hpp>
#include <opencv2/objdetect/face.hpp>
#include <algorithm>
#include <array>
#include <cmath>
#include <limits>
#include <memory>
#include <mutex>
#include <new>
#include <vector>

static_assert(CV_VERSION_MAJOR == 4 && CV_VERSION_MINOR == 13 && CV_VERSION_REVISION == 0,
              "SuiteFaceCore requires reviewed OpenCV 4.13.0");
struct sf_context {
    cv::Ptr<cv::FaceDetectorYN> detector;
    cv::Ptr<cv::FaceRecognizerSF> recognizer;
    std::mutex mutex;
    uint64_t maxPixels;
    int32_t topK;
};
struct sf_result {
    std::vector<sf_face> faces;
    std::vector<std::vector<float>> features;
};
namespace {
constexpr size_t featureSize = 128; // pinned SFace 2021dec output, checked at runtime
bool threshold(float value) { return std::isfinite(value) && value > 0 && value <= 1; }
bool validFeature(const float *values, size_t count) {
    if (!values || count != featureSize) return false;
    double sum = 0;
    for (size_t i = 0; i < count; ++i) {
        if (!std::isfinite(values[i])) return false;
        sum += double(values[i]) * values[i];
    }
    return std::isfinite(sum) && sum > 1e-20;
}
}
extern "C" sf_status sf_create(const char *yunet, const char *sface,
    float score, float nms, int32_t topK, uint64_t maxPixels, sf_context **out) {
    if (!out) return SF_INVALID_ARGUMENT;
    *out = nullptr;
    if (!yunet || !*yunet || !sface || !*sface || !threshold(score) || !threshold(nms)
        || topK < 1 || topK > 10000 || maxPixels == 0 || maxPixels > 67108864)
        return SF_INVALID_ARGUMENT;
    try {
        auto ctx = std::make_unique<sf_context>();
        ctx->maxPixels = maxPixels; ctx->topK = topK;
        ctx->detector = cv::FaceDetectorYN::create(yunet, "", cv::Size(320, 320), score,
            nms, topK, cv::dnn::DNN_BACKEND_OPENCV, cv::dnn::DNN_TARGET_CPU);
        ctx->recognizer = cv::FaceRecognizerSF::create(sface, "",
            cv::dnn::DNN_BACKEND_OPENCV, cv::dnn::DNN_TARGET_CPU);
        if (ctx->detector.empty() || ctx->recognizer.empty()) return SF_MODEL_LOAD_FAILED;
        *out = ctx.release(); return SF_OK;
    } catch (const std::bad_alloc &) { return SF_OUT_OF_MEMORY; }
      catch (...) { return SF_MODEL_LOAD_FAILED; }
}
extern "C" sf_status sf_analyze(sf_context *ctx, const uint8_t *bytes, size_t byteCount,
    int32_t width, int32_t height, size_t stride, sf_result **out) {
    if (!out) return SF_INVALID_ARGUMENT;
    *out = nullptr;
    if (!ctx || !bytes || width <= 0 || height <= 0) return SF_INVALID_ARGUMENT;
    if (uint64_t(width) * uint64_t(height) > ctx->maxPixels) return SF_LIMIT_EXCEEDED;
    const uint64_t rowBytes = uint64_t(width) * 3;
    if (rowBytes > SIZE_MAX || stride < rowBytes) return SF_INVALID_ARGUMENT;
    // Bound the entire Mat allocation extent, including last-row padding.
    if (stride > SIZE_MAX / size_t(height) || byteCount < stride * size_t(height))
        return SF_INVALID_ARGUMENT;
    try {
        std::lock_guard<std::mutex> lock(ctx->mutex);
        // OpenCV InputArray does not mutate this borrowed buffer.
        cv::Mat image(height, width, CV_8UC3, const_cast<uint8_t *>(bytes), stride);
        ctx->detector->setInputSize(image.size());
        cv::Mat detections;
        ctx->detector->detect(image, detections);
        auto result = std::make_unique<sf_result>();
        if (detections.empty()) { *out = result.release(); return SF_OK; }
        if (detections.dims != 2 || detections.cols != 15 || detections.type() != CV_32FC1
            || detections.rows < 0 || detections.rows > ctx->topK) return SF_INFERENCE_FAILED;
        result->faces.reserve(size_t(detections.rows));
        result->features.reserve(size_t(detections.rows));
        for (int row = 0; row < detections.rows; ++row) {
            sf_face face{};
            std::copy_n(detections.ptr<float>(row), 15, face.values);
            for (float value : face.values) if (!std::isfinite(value)) return SF_INFERENCE_FAILED;
            if (face.values[2] <= 0 || face.values[3] <= 0 || face.values[14] < 0
                || face.values[14] > 1) return SF_INFERENCE_FAILED;
            // A collapsed landmark set cannot define a stable alignment transform.
            double spread = 0;
            for (int point = 1; point < 5; ++point) {
                const double dx = double(face.values[4 + point * 2]) - face.values[4];
                const double dy = double(face.values[5 + point * 2]) - face.values[5];
                spread += dx * dx + dy * dy;
            }
            if (!std::isfinite(spread) || spread < 1e-12) return SF_INFERENCE_FAILED;
            cv::Mat aligned, feature;
            ctx->recognizer->alignCrop(image, detections.row(row), aligned);
            ctx->recognizer->feature(aligned, feature);
            if (feature.type() != CV_32FC1 || feature.total() != featureSize)
                return SF_INFERENCE_FAILED;
            cv::Mat contiguous = feature.clone().reshape(1, 1);
            if (!validFeature(contiguous.ptr<float>(), featureSize)) return SF_INFERENCE_FAILED;
            result->faces.push_back(face);
            result->features.emplace_back(contiguous.ptr<float>(), contiguous.ptr<float>() + featureSize);
        }
        *out = result.release(); return SF_OK;
    } catch (const std::bad_alloc &) { return SF_OUT_OF_MEMORY; }
      catch (...) { return SF_INFERENCE_FAILED; }
}
extern "C" size_t sf_result_count(const sf_result *result) {
    return result ? result->faces.size() : 0;
}
extern "C" sf_status sf_result_face(const sf_result *result, size_t index, sf_face *out) {
    if (!out || !result || index >= result->faces.size()) return SF_INVALID_ARGUMENT;
    *out = result->faces[index]; return SF_OK;
}
extern "C" sf_status sf_result_feature(const sf_result *result, size_t index,
    float *out, size_t capacity, size_t *count) {
    if (!count) return SF_INVALID_ARGUMENT;
    *count = 0;
    if (!result || index >= result->features.size() || (!out && capacity != 0))
        return SF_INVALID_ARGUMENT;
    const auto &feature = result->features[index];
    *count = feature.size();
    if (!out) return SF_OK;
    if (capacity < feature.size()) return SF_BUFFER_TOO_SMALL;
    std::copy(feature.begin(), feature.end(), out); return SF_OK;
}
extern "C" sf_status sf_match_cosine(sf_context *ctx, const float *a, size_t aCount,
    const float *b, size_t bCount, double *out) {
    if (!out) return SF_INVALID_ARGUMENT;
    *out = std::numeric_limits<double>::quiet_NaN();
    if (!ctx || !validFeature(a, aCount) || !validFeature(b, bCount)) return SF_INVALID_ARGUMENT;
    try {
        std::lock_guard<std::mutex> lock(ctx->mutex);
        // match normalizes in place in some OpenCV versions; own copies protect callers.
        cv::Mat left(1, int(aCount), CV_32F), right(1, int(bCount), CV_32F);
        std::copy_n(a, aCount, left.ptr<float>());
        std::copy_n(b, bCount, right.ptr<float>());
        const double value = ctx->recognizer->match(left, right, cv::FaceRecognizerSF::FR_COSINE);
        if (!std::isfinite(value) || value < -1.00001 || value > 1.00001) return SF_INFERENCE_FAILED;
        *out = std::clamp(value, -1.0, 1.0); return SF_OK;
    } catch (const std::bad_alloc &) { return SF_OUT_OF_MEMORY; }
      catch (...) { return SF_INFERENCE_FAILED; }
}
extern "C" void sf_result_destroy(sf_result *result) { delete result; }
extern "C" void sf_destroy(sf_context *ctx) { delete ctx; }
