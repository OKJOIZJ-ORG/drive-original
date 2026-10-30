import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRepairPlan} from '../qa/media-format-repair-plan.mjs';

const ftyp=(major,compatible=[])=>{const bytes=Buffer.alloc(16+compatible.length*4);bytes.writeUInt32BE(bytes.length);bytes.write('ftyp',4,'ascii');bytes.write(major,8,'ascii');compatible.forEach((brand,index)=>bytes.write(brand,16+index*4,'ascii'));return bytes.toString('hex');};
const file=(id,name,mimeType,overrides={})=>({id,name,mimeType,parents:['FOLDER_ID'],folder:'display/path',size:'1234',md5Checksum:`md5-${id}`,headRevisionId:`rev-${id}`,modifiedTime:'2026-10-29T00:00:00.000Z',capabilities:{canRename:true,canEdit:true},...overrides});
const result=(id,kind,signature)=>({id,kind,signature,bytes:1024,status:206});
function plan(files,results,oldOverrides={}){
 const oldFiles=files.map(f=>({...f,...oldOverrides[f.id]}));
 return buildRepairPlan({files:oldFiles},{files},{results}).rows;
}

test('repairs a temporary TS suffix without duplicating the embedded extension and records immutable file identity',()=>{
 const f=file('ts-id','recording.mp4.crswap','video/mp4');
 const [row]=plan([f],[result(f.id,'ts')]);
 assert.equal(row.after.name,'recording.ts');assert.equal(row.after.mimeType,'video/mp2t');
 assert.equal(row.id,f.id);assert.deepEqual(row.parents,f.parents);assert.equal(row.identity.md5Checksum,f.md5Checksum);assert.equal(row.identity.headRevisionId,f.headRevisionId);assert.equal(row.identity.size,f.size);
});

test('requires the full prior identity match and the matching capability for each metadata field',()=>{
 const stale=file('stale','movie.mp4','video/mp4');
 const noRename=file('no-rename','clip.mp4','video/mp4',{capabilities:{canRename:false,canEdit:true}});
 const noEdit=file('no-edit','photo.jpg','image/jpeg',{mimeType:'application/octet-stream',capabilities:{canRename:true,canEdit:false}});
 const rows=buildRepairPlan({files:[{...stale,headRevisionId:'prior-revision'},noRename,noEdit]},{files:[stale,noRename,noEdit]}, {results:[result(stale.id,'ts'),result(noRename.id,'ts'),result(noEdit.id,'jpeg')]});
 assert.deepEqual(rows.rows.map(row=>row.id),['no-rename']);
 assert.equal(rows.rows[0].after.name,'clip.mp4');assert.equal(rows.rows[0].after.mimeType,'video/mp2t');
 assert.equal(rows.warnings.staleIdentity,1);assert.equal(rows.warnings.noRenameCapability,1);assert.equal(rows.warnings.noMimeCapability,1);
});

test('corrects the two legacy TS MIME variants without renaming accepted TS aliases',()=>{
 const a=file('mime-a','one.mts','video/vnd.dlna.mpeg-tts');
 const b=file('mime-b','two.ts','video/mp2t');
 const rows=plan([a,b],[result(a.id,'ts'),result(b.id,'ts')]);
 assert.equal(rows.length,1);assert.equal(rows[0].id,a.id);assert.equal(rows[0].after.name,'one.mts');assert.equal(rows[0].after.mimeType,'video/mp2t');
});

test('uses complete exclusive MP4 brands for MOV repair and leaves mixed brands and generic ISO alone',()=>{
 const mov=file('mov','take.mov','video/quicktime');
 const mixed=file('mixed','mixed.mov','video/quicktime');
 const generic=file('generic','audio.m4a','audio/mp4');
 const rows=plan([mov,mixed,generic],[result(mov.id,'iso',ftyp('mp42',['mp42','mp41'])),result(mixed.id,'iso',ftyp('mp42',['qt  ','mp42'])),result(generic.id,'iso',ftyp('isom',['iso2']))]);
 assert.equal(rows.length,1);assert.equal(rows[0].id,mov.id);assert.equal(rows[0].after.name,'take.mp4');assert.equal(rows[0].after.mimeType,'video/mp4');
});

test('leaves sidecars, unknown signatures, and files without a complete content identity untouched',()=>{
 const sidecar=file('srt','captions.srt','application/octet-stream');
 const unknown=file('unknown','empty.bin','application/octet-stream');
 const incomplete=file('incomplete','picture.png','image/png',{md5Checksum:''});
 const rows=buildRepairPlan({files:[sidecar,unknown,incomplete]},{files:[sidecar,unknown,incomplete]}, {results:[result(sidecar.id,'unknown'),result(unknown.id,'unknown'),result(incomplete.id,'webp')]});
 assert.deepEqual(rows.rows,[]);assert.equal(rows.warnings.unknownOrAmbiguous,2);assert.equal(rows.warnings.incompleteContentIdentity,1);
});

test('collision resolution checks every sibling with NFC and case-insensitive comparison and reserves deterministic names',()=>{
 const wrong=file('wrong','cafe\u0301.mov','video/quicktime');
 const existing=file('existing','CAFÉ.MP4','video/mp4');
 const rows=plan([wrong,existing],[result(wrong.id,'iso',ftyp('mp42',['mp41']))]);
 assert.equal(rows.length,1);assert.equal(rows[0].after.name,'cafe\u0301 (형식교정 2).mp4');
 assert.equal(rows[0].id,'wrong');assert.deepEqual(rows[0].parents,['FOLDER_ID']);
});

test('planned targets reserve their names for later repairs in the same folder',()=>{
 const first=file('a-file','clip.mp4','video/mp4');
 const second=file('b-file','CLIP.MP4','video/mp4');
 const rows=plan([first,second],[result(first.id,'ts'),result(second.id,'ts')]);
 assert.deepEqual(rows.map(row=>row.after.name),['clip.ts','CLIP (형식교정 2).ts']);
});

test('keeps unobserved TS packet layouts ambiguous and treats slash characters as part of the Drive name',()=>{
 const unsupported=file('unseen-ts','capture.mp4','video/mp4');
 const literalName=file('literal-name','folder\\clip.mp4','video/mp4');
 const rows=plan([unsupported,literalName],[result(unsupported.id,'ts192'),result(literalName.id,'ts')]);
 assert.equal(rows.length,1);
 assert.equal(rows[0].id,literalName.id);
 assert.equal(rows[0].after.name,'folder\\clip.ts');
});
