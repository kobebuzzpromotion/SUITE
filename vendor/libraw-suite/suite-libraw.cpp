// SUITE native extension ABI 1. Appended to upstream libraw_c_api.cpp.
// Original SUITE integration code; upstream LibRaw remains LGPL-2.1/CDDL-1.0.
#include <new>
#include <cstddef>

extern "C" DllDef int suite_libraw_abi_version(void) { return 1; }

extern "C" DllDef int suite_libraw_set_max_raw_memory_mb(
    libraw_data_t *lr, unsigned int megabytes)
{
    if (!lr || !lr->parent_class || megabytes < 1 || megabytes > 512)
        return LIBRAW_UNSPECIFIED_ERROR;
    // Must be set before unpack; this does not bound the whole WASM heap.
    if (lr->progress_flags & LIBRAW_PROGRESS_LOAD_RAW)
        return LIBRAW_OUT_OF_ORDER_CALL;
    lr->rawparams.max_raw_memory_mb = megabytes;
    return LIBRAW_SUCCESS;
}

extern "C" DllDef int suite_libraw_plan_full_geometry(
    const void *input, size_t length, unsigned int megabytes,
    int *width, int *height)
{
    if (!input || !length || !width || !height || width == height ||
        megabytes < 1 || megabytes > 512)
        return LIBRAW_UNSPECIFIED_ERROR;
    *width = *height = 0;
    try {
        // Separate lifetime: never change the active decoder's sizing/progress.
        LibRaw planner;
        planner.imgdata.rawparams.max_raw_memory_mb = megabytes;
        // LibRaw's historical open_buffer interface accepts void* although
        // the caller's original bytes are input only, never changed here.
        int status = planner.open_buffer(const_cast<void *>(input), length);
        if (status != LIBRAW_SUCCESS) return status;
        planner.imgdata.rawparams.max_raw_memory_mb = megabytes;
        planner.imgdata.params.half_size = 0;
        planner.imgdata.params.user_flip = -1;
        planner.imgdata.params.use_fuji_rotate = 1;
        status = planner.adjust_sizes_info_only();
        if (status != LIBRAW_SUCCESS) return status;
        // adjust_sizes_info_only has already applied aspect/Fuji/flip to i*.
        // get_mem_image_format here would read a DIFFERENT sizing state.
        const int w = planner.imgdata.sizes.iwidth;
        const int h = planner.imgdata.sizes.iheight;
        if (w <= 0 || h <= 0) return LIBRAW_UNSPECIFIED_ERROR;
        *width = w;
        *height = h;
        return LIBRAW_SUCCESS;
    } catch (const std::bad_alloc &) {
        return LIBRAW_UNSUFFICIENT_MEMORY;
    } catch (...) {
        return LIBRAW_UNSPECIFIED_ERROR;
    }
}

extern "C" DllDef int suite_libraw_get_processed_format(
    libraw_data_t *lr, int *width, int *height, int *colors, int *bits)
{
    if (!lr || !lr->parent_class || !width || !height || !colors || !bits ||
        width == height || width == colors || width == bits ||
        height == colors || height == bits || colors == bits)
        return LIBRAW_UNSPECIFIED_ERROR;
    *width = *height = *colors = *bits = 0;
    if (!lr->image || !(lr->progress_flags & LIBRAW_PROGRESS_CONVERT_RGB))
        return LIBRAW_OUT_OF_ORDER_CALL;
    try {
        int w = 0, h = 0, c = 0, b = 0;
        static_cast<LibRaw *>(lr->parent_class)->get_mem_image_format(&w, &h, &c, &b);
        if (w <= 0 || h <= 0 || c < 1 || c > 4 || (b != 8 && b != 16))
            return LIBRAW_UNSPECIFIED_ERROR;
        *width = w; *height = h; *colors = c; *bits = b;
        return LIBRAW_SUCCESS;
    } catch (...) {
        return LIBRAW_UNSPECIFIED_ERROR;
    }
}
