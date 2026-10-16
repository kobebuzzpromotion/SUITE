#ifndef SUITE_FACE_CORE_H
#define SUITE_FACE_CORE_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
typedef struct sf_context sf_context;
typedef struct sf_result sf_result;
typedef enum sf_status {
    SF_OK = 0, SF_INVALID_ARGUMENT = 1, SF_MODEL_LOAD_FAILED = 2,
    SF_INFERENCE_FAILED = 3, SF_OUT_OF_MEMORY = 4, SF_BUFFER_TOO_SMALL = 5,
    SF_LIMIT_EXCEEDED = 6
} sf_status;
/* All coordinates: upright analysis image pixels, origin top-left. YuNet order:
   bbox x,y,w,h; right eye x,y; left eye x,y; nose x,y;
   right mouth corner x,y; left mouth corner x,y; detection score.
   Right/left are OpenCV anatomical labels, not an instruction to mirror pixels. */
typedef struct sf_face { float values[15]; } sf_face;
/* Caller MUST verify model bytes + SHA256 against the pinned manifest first and
   keep the files immutable through create. Context binds that exact model pair.
   max_pixels is an analysis-image admission budget, NOT an original RAW limit.
   top_k: 1..10000; max_pixels: 1..67108864. Thresholds are not identity policy. */
sf_status sf_create(const char *yunet_path, const char *sface_path,
                    float score_threshold, float nms_threshold, int32_t top_k,
                    uint64_t max_pixels, sf_context **out_context);
/* Synchronous CPU inference. Input is non-premultiplied, upright BGR8, 3 channels.
   bytes remain readable and immutable until return; no orientation/resize here.
   Result is independently owned; zero faces is SF_OK with an empty result.
   Same-context calls serialize. Destroy must not race any context call. */
sf_status sf_analyze(sf_context *, const uint8_t *bytes, size_t byte_count,
                     int32_t width, int32_t height, size_t stride, sf_result **out_result);
size_t sf_result_count(const sf_result *);
sf_status sf_result_face(const sf_result *, size_t index, sf_face *out_face);
/* out_count is set to required floats. NULL buffer + zero capacity queries size.
   Features belong to this model version only; caller retains version with data. */
sf_status sf_result_feature(const sf_result *, size_t index, float *out_values,
                            size_t capacity, size_t *out_count);
/* Caller must establish both features have the context's SFace manifest version.
   Score only: no automatic identity acceptance threshold is applied. */
sf_status sf_match_cosine(sf_context *, const float *a, size_t a_count,
                          const float *b, size_t b_count, double *out_score);
void sf_result_destroy(sf_result *);
void sf_destroy(sf_context *);
#ifdef __cplusplus
}
#endif
#endif
