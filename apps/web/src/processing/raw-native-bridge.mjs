import {LibRaw} from '@colorhythm/libraw-wasm';
import {assertInputBuffer,checkAbort} from './pure.mjs';

const EXPORTS=['_suite_libraw_abi_version','_suite_libraw_plan_full_geometry',
  '_suite_libraw_set_max_raw_memory_mb','_suite_libraw_get_processed_format','_malloc','_free'];

/** Adapter for @colorhythm/libraw-wasm 1.1.1's actual JS wrapper layout.
 * No struct offsets: native ABI 1 owns C++ field access. Both rebuilt WASM and
 * generated glue must expose the suite functions. Unknown layouts fail closed.
 */
export function suiteNativeABI(module) {
  if(!module||module!==LibRaw.module||!(module.HEAPU8 instanceof Uint8Array)||
    EXPORTS.some(key=>typeof module[key]!=='function'))return 0;
  try{return module._suite_libraw_abi_version()===1?1:0;}catch{return 0;}
}
function range(module,pointer,length) {
  if(!Number.isSafeInteger(pointer)||pointer<=0||!Number.isSafeInteger(length)||length<1||
    pointer+length>module.HEAPU8.byteLength)throw Error('RAW_NATIVE_HEAP_RANGE');
  return pointer;
}
function status(code) {
  if(code!==0){const error=Error('RAW_NATIVE_BRIDGE_FAILURE');error.nativeCode=code;throw error;}
}
function words(module,count,run) {
  const pointer=module._malloc(count*4);
  if(!pointer)throw Error('RAW_NATIVE_ALLOCATION_FAILED');
  try {
    range(module,pointer,count*4);module.HEAPU8.fill(0,pointer,pointer+count*4);
    status(run(pointer));
    // Native calls can grow memory. Reacquire the heap after every native call.
    range(module,pointer,count*4);
    const view=new DataView(module.HEAPU8.buffer,module.HEAPU8.byteOffset+pointer,count*4);
    return Array.from({length:count},(_,i)=>view.getInt32(i*4,true));
  }finally{module._free(pointer);}
}
export function createRawNativeBridge(module,decoder) {
  if(suiteNativeABI(module)!==1)throw Error('RAW_NATIVE_EXTENSION_REQUIRED');
  function decoderPointer() {
    const descriptor=Object.getOwnPropertyDescriptor(decoder,'lr');
    if(!(decoder instanceof LibRaw)||decoder.status!=='ready'||!descriptor||
      !Object.hasOwn(descriptor,'value'))throw Error('RAW_WRAPPER_LAYOUT_UNSUPPORTED');
    return range(module,descriptor.value,4);
  }
  decoderPointer();
  return Object.freeze({
    abiVersion:1,
    planFullGeometry(buffer,{maxRawMB=512,signal}={}) {
      assertInputBuffer(buffer);checkAbort(signal);decoderPointer();
      if(maxRawMB!==512)throw Error('INVALID_RAW_MEMORY_BUDGET');
      // Separate input allocation: native temporary decoder dies before free.
      // Never recycle or change the live decoder to measure the full geometry.
      const pointer=module._malloc(buffer.byteLength);
      if(!pointer)throw Error('RAW_NATIVE_ALLOCATION_FAILED');
      try {
        range(module,pointer,buffer.byteLength);module.HEAPU8.set(new Uint8Array(buffer),pointer);
        const [width,height]=words(module,2,out=>module._suite_libraw_plan_full_geometry(pointer,buffer.byteLength,maxRawMB,out,out+4));
        checkAbort(signal);return {width,height};
      }finally{module._free(pointer);}
    },
    setMaxRawMemoryMB(value=512) {
      if(value!==512)throw Error('INVALID_RAW_MEMORY_BUDGET');
      status(module._suite_libraw_set_max_raw_memory_mb(decoderPointer(),value));
    },
    getProcessedFormat() {
      const pointer=decoderPointer();
      const [width,height,colors,bits]=words(module,4,out=>module._suite_libraw_get_processed_format(pointer,out,out+4,out+8,out+12));
      return {width,height,colors,bits};
    },
  });
}
