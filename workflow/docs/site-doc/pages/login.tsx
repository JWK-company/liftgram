import { useEffect } from 'react'

export default function LoginPage() {
  useEffect(() => {
    window.location.href = '/api/auth/login'
  }, [])

  return (
    <div style={{display:'flex',justifyContent:'center',alignItems:'center',minHeight:'100vh',background:'#0a0a0a'}}>
      <div style={{textAlign:'center',color:'#9ca3af'}}>
        <h1 style={{color:'#818cf8',fontSize:'1.5rem',marginBottom:'1rem'}}>Ouroboros Docs</h1>
        <p>Keycloak으로 리다이렉트 중...</p>
        <p style={{marginTop:'1rem'}}>
          <a href="/api/auth/login" style={{color:'#818cf8'}}>자동 이동되지 않으면 클릭</a>
        </p>
      </div>
    </div>
  )
}
