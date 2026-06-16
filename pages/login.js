import Head from "next/head";
import { useState } from "react";
import { useRouter } from "next/router";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        const from = router.query.from || "/";
        router.push(from);
      } else {
        const data = await res.json();
        setError(data.error || "Login gagal");
      }
    } catch {
      setError("Terjadi kesalahan, coba lagi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Login — AkademiAI</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=optional" rel="stylesheet" />
      </Head>
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-logo">🎓</div>
          <h1 className="login-title">AkademiAI</h1>
          <p className="login-sub">UBP Karawang — Masukkan password dashboard</p>
          <form onSubmit={handleSubmit} className="login-form">
            <input
              type="password"
              className="login-input"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
              required
            />
            {error && <div className="login-error">{error}</div>}
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? "Masuk..." : "Masuk →"}
            </button>
          </form>
        </div>
        <style jsx>{`
          .login-wrap {
            min-height: 100vh;
            background: #07101f;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Outfit', system-ui, sans-serif;
            padding: 24px;
          }
          .login-card {
            background: #0c1829;
            border: 1px solid #1e3350;
            border-radius: 16px;
            padding: 40px 36px;
            width: 100%;
            max-width: 360px;
            text-align: center;
          }
          .login-logo {
            font-size: 48px;
            margin-bottom: 12px;
          }
          .login-title {
            font-size: 24px;
            font-weight: 800;
            color: #e8f0f8;
            margin: 0 0 6px;
            letter-spacing: -.5px;
          }
          .login-sub {
            font-size: 13px;
            color: #7a9ab8;
            margin: 0 0 28px;
            line-height: 1.5;
          }
          .login-form {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }
          .login-input {
            background: #101f33;
            border: 1px solid #1e3350;
            border-radius: 10px;
            padding: 12px 16px;
            color: #e8f0f8;
            font-family: inherit;
            font-size: 15px;
            outline: none;
            transition: border-color 150ms;
            width: 100%;
          }
          .login-input:focus {
            border-color: #10b981;
          }
          .login-error {
            background: rgba(239,68,68,.1);
            border: 1px solid rgba(239,68,68,.2);
            border-radius: 8px;
            padding: 10px 14px;
            color: #fca5a5;
            font-size: 13px;
          }
          .login-btn {
            background: #10b981;
            color: #fff;
            border: none;
            border-radius: 10px;
            padding: 13px;
            font-family: inherit;
            font-size: 15px;
            font-weight: 700;
            cursor: pointer;
            transition: background 150ms;
          }
          .login-btn:hover { background: #059669; }
          .login-btn:disabled { opacity: .5; cursor: not-allowed; }
        `}</style>
      </div>
    </>
  );
}
