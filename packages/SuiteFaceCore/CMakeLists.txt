cmake_minimum_required(VERSION 3.20)
project(SuiteFaceCore VERSION 1.0.0 LANGUAGES CXX)
# Intentionally no stub backend or network FetchContent fallback.
find_package(OpenCV 4.13.0 EXACT REQUIRED COMPONENTS core imgproc dnn objdetect)
find_package(Threads REQUIRED)
add_library(SuiteFaceCore STATIC src/SuiteFaceCore.cpp)
target_compile_features(SuiteFaceCore PUBLIC cxx_std_17)
target_include_directories(SuiteFaceCore PUBLIC $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include> $<INSTALL_INTERFACE:include>)
target_include_directories(SuiteFaceCore SYSTEM PRIVATE ${OpenCV_INCLUDE_DIRS})
target_link_libraries(SuiteFaceCore PUBLIC ${OpenCV_LIBS} Threads::Threads)
set_target_properties(SuiteFaceCore PROPERTIES POSITION_INDEPENDENT_CODE ON)
install(TARGETS SuiteFaceCore ARCHIVE DESTINATION lib)
install(FILES include/SuiteFaceCore.h include/module.modulemap DESTINATION include)

# Optional web artifact; requires an independently supplied Emscripten build of
# the exact OpenCV version above. Native static-library configuration is unchanged.
if(EMSCRIPTEN)
  add_executable(SuiteFaceCoreWasm src/SuiteFaceCore.cpp)
  target_compile_features(SuiteFaceCoreWasm PRIVATE cxx_std_17)
  target_include_directories(SuiteFaceCoreWasm PRIVATE include ${OpenCV_INCLUDE_DIRS})
  target_link_libraries(SuiteFaceCoreWasm PRIVATE ${OpenCV_LIBS} Threads::Threads)
  target_compile_options(SuiteFaceCoreWasm PRIVATE -fexceptions)
  target_link_options(SuiteFaceCoreWasm PRIVATE
    "--no-entry"
    "-fexceptions"
    "-sDISABLE_EXCEPTION_CATCHING=0"
    "-sMODULARIZE=1"
    "-sEXPORT_ES6=1"
    "-sENVIRONMENT=worker"
    "-sWASM_BIGINT=1"
    "-sMEMORY64=0"
    "-sALLOW_MEMORY_GROWTH=1"
    "-sINITIAL_MEMORY=67108864"
    "-sMAXIMUM_MEMORY=536870912"
    "-sSTACK_SIZE=1048576"
    "-sFORCE_FILESYSTEM=1"
    "-sEXPORTED_RUNTIME_METHODS=['FS','HEAPU8']"
    "-sEXPORTED_FUNCTIONS=['_malloc','_free','_sf_create','_sf_analyze','_sf_result_count','_sf_result_face','_sf_result_feature','_sf_match_cosine','_sf_result_destroy','_sf_destroy']"
  )
  set_target_properties(SuiteFaceCoreWasm PROPERTIES SUFFIX ".mjs")
  # Install only explicitly built runtime artifacts, never model files.
  install(FILES "${CMAKE_CURRENT_BINARY_DIR}/SuiteFaceCoreWasm.mjs"
                "${CMAKE_CURRENT_BINARY_DIR}/SuiteFaceCoreWasm.wasm"
          DESTINATION share/suite-face-core)
endif()
