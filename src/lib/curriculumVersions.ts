type Version={id:string;active:boolean;curriculum_type:string;grade:number;subject_code:string;year_from:number;year_to:number|null}
/** PDF yayın hedefi resmî müfredat sürümünün yerine geçmez. */
export const versionFor=<T extends Version>(vs:T[],grade:number,subject:string,year:number)=>vs.filter(v=>v.active&&v.curriculum_type!=='PDF'&&v.grade===grade&&v.subject_code===subject&&v.year_from<=year&&(v.year_to===null||v.year_to>=year)).sort((a,b)=>b.year_from-a.year_from)[0]??null
