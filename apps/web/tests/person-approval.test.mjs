import test from 'node:test';
import assert from 'node:assert/strict';
import {personProcessingStatus,PERSON_PRIVACY_BLOCKED,PERSON_PRIVACY_APPROVED,PERSON_MODEL_SHA256,PERSON_SDK_VERSION} from '../src/person-privacy.mjs';

const approved = {SUITE_PERSON_PRIVACY_DECISION:'APPROVED',SUITE_PERSON_PRIVACY_SDK:PERSON_SDK_VERSION,
  SUITE_PERSON_PRIVACY_MODEL_SHA256:PERSON_MODEL_SHA256,SUITE_PERSON_PRIVACY_EVIDENCE_SHA256:'a'.repeat(64)};

test('PERSON-APPROVAL01: absence and partial or stale approval fail closed', () => {
  assert.equal(personProcessingStatus(),PERSON_PRIVACY_BLOCKED);
  for (const key of Object.keys(approved)) {
    const env={...approved};delete env[key];assert.equal(personProcessingStatus(env),PERSON_PRIVACY_BLOCKED,key);
  }
  for (const [key,value] of [['SUITE_PERSON_PRIVACY_SDK','@mediapipe/tasks-vision@latest'],
    ['SUITE_PERSON_PRIVACY_MODEL_SHA256','b'.repeat(64)],['SUITE_PERSON_PRIVACY_EVIDENCE_SHA256','not-a-hash'],
    ['SUITE_PERSON_PRIVACY_DECISION','PENDING']]) assert.equal(personProcessingStatus({...approved,[key]:value}),PERSON_PRIVACY_BLOCKED,key);
});

test('PERSON-APPROVAL02: exact reviewed artifact and evidence reference yield production status', () => {
  assert.equal(personProcessingStatus(approved),PERSON_PRIVACY_APPROVED);
});
