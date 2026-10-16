// This reports the current Web identity path, not the separate legacy MediaPipe
// landmark path. Repository ONNX files are not installed browser model receipts.
export const LOCAL_AI_MANUAL_TARGETS = Object.freeze([
  Object.freeze({id:'manual-skin-controls',label:'手動の肌補正へ'}),
  Object.freeze({id:'manual-makeup-controls',label:'手塗りメイクへ'}),
  Object.freeze({id:'manual-liquify-controls',label:'手動ゆがみ補正へ'})
]);
export function createLocalAIBrowserStatusProvider(root) {
  return () => ({
    codePresent:true,
    device:{
      // WebAssembly existence is only a prerequisite, not OS/model support proof.
      operatingSystemSupported:typeof WebAssembly==='undefined'?false:null,
      availableWorkingBytes:null,thermal:'unknown'
    },
    // No YuNet/SFace identity Worker is registered by this editor yet.
    runtime:{included:false,connected:false,requiredWorkingBytes:null},
    requiredAssetIDs:['yunet','sface'],
    models:{
      yunet:{installed:null,hashVerified:null,commercialUse:'unreviewed',redistribution:'unreviewed'},
      sface:{installed:null,hashVerified:null,commercialUse:'unreviewed',redistribution:'unreviewed'}
    },
    cost:'noPerUseCharge',
    manualAvailable:LOCAL_AI_MANUAL_TARGETS.some(target=>root.querySelector(`#${target.id}`)!==null)
  });
}
