import {describe,it,expect} from 'vitest'
import {pdfOutcomeGrade,pdfVersionsFor} from './pdfOutcomes'
import {versionFor} from './curriculumVersions'
const row={grade:12,exam_type:'AYT',raw_code:'AYT.PSKL.10.36',outcome_grade:null}
describe('PDF hedefleri önizlemesi',()=>{
  it('kodun konu sınıfını kullanır, soru numarasını sınıf sanmaz; sınıf sınırı korunur',()=>{
    expect(pdfOutcomeGrade(row)).toBe(10)
    expect(pdfOutcomeGrade({...row,raw_code:'AYT.MNTK.12.2'})).toBe(12)
    expect(pdfOutcomeGrade({...row,raw_code:'AYT.MAT.6.10'})).toBe(12)
    expect(pdfOutcomeGrade({...row,grade:6,exam_type:'GENEL',raw_code:'T.9.3.1'})).toBe(6)
  })
  it('PDF katalog resmî program seçimini değiştirmez; yayıncı ve sınıf sınırı korunur',()=>{
    const base={grade:10,subject_code:'FEL',active:true,year_from:2000,year_to:null}
    const official={...base,id:'official',curriculum_type:'LEGACY' as const}
    const pdf={...base,id:'pdf',curriculum_type:'PDF' as const,publisher_id:'pub',year_from:2026}
    expect(versionFor([pdf,official],10,'FEL',2026)?.id).toBe('official')
    expect(pdfVersionsFor([pdf,official],[10],'FEL','pub')).toEqual(['pdf'])
    expect(pdfVersionsFor([pdf],[10],'FEL','other')).toEqual([])
    expect(pdfVersionsFor([pdf],[11],'FEL','pub')).toEqual([])
  })
})
