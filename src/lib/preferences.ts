const memory = new Map<string,string>()
export function readPreference(uid:string,key:'theme'|'text'):string|null {
 const name='bk-'+key+':'+uid
 let value=memory.get(name)??null
 if(value===null)try{value=localStorage.getItem(name)}catch{}
 const allowed=key==='theme'?['school','auto','light','dark']:['school','normal','buyuk']
 return value&&allowed.includes(value)?value:null
}
export function writePreference(uid:string,key:'theme'|'text',value:string){
 const name='bk-'+key+':'+uid;memory.set(name,value)
 try{localStorage.setItem(name,value)}catch{}
 window.dispatchEvent(new Event('bk-preferences'))
}
