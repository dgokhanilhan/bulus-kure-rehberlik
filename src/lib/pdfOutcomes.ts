type Version={id:string;active:boolean;curriculum_type:string;grade:number;subject_code:string;publisher_id?:string|null}
export const pdfVersionsFor=(vs:Version[],grades:number[],subject:string,publisher?:string|null)=>vs.filter(v=>v.active&&v.curriculum_type==='PDF'&&grades.includes(v.grade)&&v.subject_code===subject&&(publisher===undefined||(v.publisher_id??null)===publisher)).map(v=>v.id)
export const pdfOutcomeKey=(r:{exam_id:string;section_key:string;q_no:number})=>`${r.exam_id}:${r.section_key}:${r.q_no}`
export function pdfOutcomeGrade(r:{grade:number;exam_type:string;raw_code:string|null;outcome_grade:number|null}): number {
  const allowed=['TYT','AYT','YKS'].includes(r.exam_type) ? [9,10,11,12] : [r.grade]
  const coded=r.raw_code?.match(/(?:^|\.)(1[0-2]|[5-9])\./)?.[1]
  const grade=r.outcome_grade ?? (coded ? Number(coded) : r.grade)
  return allowed.includes(grade) ? grade : r.grade
}
