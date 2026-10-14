import type {SupabaseClient} from '@supabase/supabase-js'
/** Bazı Auth sunucuları current_password alanını dikkate almaz. Mevcut
 * şifre ayrı, kalıcı olmayan oturumda doğrulanır; asıl MFA oturumu korunur. */
export async function changeOwnPassword(client:SupabaseClient,verification:SupabaseClient,currentPassword:string,password:string,nonce?:string){
 const user=await client.auth.getUser()
 if(user.error||!user.data.user?.email)return {error:{code:'session_missing',message:'Oturum doğrulanamadı.'}}
 const checked=await verification.auth.signInWithPassword({email:user.data.user.email,password:currentPassword})
 try{
  if(checked.error||checked.data.user?.id!==user.data.user.id)return {error:{code:'invalid_credentials',message:'Mevcut şifre doğrulanamadı.'}}
  return await client.auth.updateUser({password,...(nonce?{nonce}:{})})
 }finally{await verification.auth.signOut({scope:'local'})}
}
