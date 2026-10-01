'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),{decode}=require('./pc-snapshot-uids.cjs');
test('normal dynamic play/pause labels and original shortcut label use the same control',()=>{for(const s of ['재생','일시정지','일시 정지','재생/일시정지 (Space / K)'])a.deepEqual(decode(' uid=2_9 button "'+s+'"'),{control:'2_9'});});
test('unrelated private titles never appear in reduced handles',()=>{a.deepEqual(decode('uid=1_0 RootWebArea "PRIVATE"\nuid=1_4 button "재생 이야기.mp4"\nuid=1_5 searchbox "PRIVATE"\nuid=1_6 button "RC32 QA seek50"\nuid=1_7 button "상위 폴더로 이동"'),{search:'1_5',seek50:'1_6',up:'1_7'});});
test('ambiguous live controls fail before any native input',()=>{a.throws(()=>decode('uid=1_1 button "재생"\nuid=1_2 button "일시 정지"'),/AMBIGUOUS/);});
