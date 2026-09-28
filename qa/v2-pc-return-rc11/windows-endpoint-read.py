import ctypes as c,uuid,json,threading,os
def timeout():
 print(json.dumps({"endpointRead":"timeout"}),flush=True);os._exit(2)
timer=threading.Timer(5,timeout);timer.daemon=True;timer.start()
class GUID(c.Structure):
 _fields_=[("d1",c.c_uint32),("d2",c.c_uint16),("d3",c.c_uint16),("d4",c.c_ubyte*8)]
def guid(s):return GUID.from_buffer_copy(uuid.UUID(s).bytes_le)
P=c.c_void_p;H=c.c_long;U=c.c_uint32
def call(p,index,types,*args):
 table=c.cast(p,c.POINTER(c.POINTER(P))).contents
 return c.WINFUNCTYPE(H,P,*types)(table[index])(p,*args)
def release(p):
 if p:call(p,2,[])
ole=c.OleDLL("ole32")
ole.CoInitializeEx.argtypes=[P,U];ole.CoInitializeEx.restype=H
ole.CoCreateInstance.argtypes=[c.POINTER(GUID),P,U,c.POINTER(GUID),c.POINTER(P)];ole.CoCreateInstance.restype=H
init=ole.CoInitializeEx(None,2)
out={"endpointRead":"completed","comInitHr":hex(init&0xffffffff)}
enumerator=P()
cls=guid("BCDE0395-E52F-467C-8E3D-C4579291692E");iid=guid("A95664D2-9614-4F35-A746-DE8DB63617E6")
hr=ole.CoCreateInstance(c.byref(cls),None,23,c.byref(iid),c.byref(enumerator))
out["enumeratorHr"]=hex(hr&0xffffffff)
if hr>=0:
 collection=P();eh=call(enumerator,3,[c.c_int,U,c.POINTER(P)],0,1,c.byref(collection));out["activeEnumerationHr"]=hex(eh&0xffffffff)
 if eh>=0:
  count=U();ch=call(collection,3,[c.POINTER(U)],c.byref(count));out["activeRenderCount"]=count.value if ch>=0 else None
  release(collection)
 defaults={}
 for role,name in [(0,"console"),(1,"multimedia"),(2,"communications")]:
  endpoint=P();rh=call(enumerator,4,[c.c_int,c.c_int,c.POINTER(P)],0,role,c.byref(endpoint))
  item={"hr":hex(rh&0xffffffff),"present":rh>=0 and bool(endpoint)}
  if rh>=0:
   state=U();sh=call(endpoint,6,[c.POINTER(U)],c.byref(state));item["stateHr"]=hex(sh&0xffffffff);item["active"]=sh>=0 and bool(state.value&1);release(endpoint)
  defaults[name]=item
 out["defaults"]=defaults;release(enumerator)
if init>=0:ole.CoUninitialize()
timer.cancel();print(json.dumps(out),flush=True)
