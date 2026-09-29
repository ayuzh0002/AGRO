import pathlib

HTML_CSS = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>AgroIn - Smart Farm Advisory Platform</title>
<meta name="description" content="Real-time crop disease diagnosis, soil telemetry, ML crop recommendations."/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
<style>
:root{--g1:#0d3320;--g2:#155c38;--g3:#1e8449;--g4:#27ae60;--g5:#2ecc71;--amber:#f39c12;--ap:#fef9e7;--red:#c0392b;--rp:#fdedec;--sky:#2980b9;--sp:#eaf4fb;--pu:#8e44ad;--pp:#f5eef8;--tx:#1a1a2e;--t2:#4a4a6a;--t3:#8a8aaa;--bg:#f0f4f0;--sf:#fff;--bd:rgba(30,132,73,.15);--s1:0 1px 4px rgba(0,0,0,.06);--s2:0 4px 20px rgba(0,0,0,.09);--s3:0 12px 40px rgba(0,0,0,.14);--r:16px;--rs:10px;--t:.2s cubic-bezier(.4,0,.2,1)}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--tx);line-height:1.6;min-height:100vh}
button{font-family:inherit;cursor:pointer;border:none;outline:none}
input,select,textarea{font-family:inherit;outline:none}
::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-thumb{background:var(--g4);border-radius:99px}
#app{display:flex;min-height:100vh}
#sb{width:240px;background:var(--g1);color:#fff;display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:200;transition:transform var(--t)}
.sbl{padding:20px 20px 16px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;align-items:center;gap:10px}
.sbli{width:38px;height:38px;background:linear-gradient(135deg,var(--g4),var(--g5));border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0}
.sblt{font-weight:800;font-size:1.25rem}.sbls{font-size:.65rem;opacity:.55;font-weight:500;text-transform:uppercase}
.sbn{flex:1;padding:12px 10px;overflow-y:auto}
.nsl{font-size:.62rem;font-weight:700;text-transform:uppercase;opacity:.45;padding:14px 10px 6px}
.ni{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:var(--rs);font-size:.875rem;font-weight:500;color:rgba(255,255,255,.7);cursor:pointer;transition:all var(--t);margin-bottom:2px}
.ni:hover{background:rgba(255,255,255,.08);color:#fff}
.ni.active{background:var(--g3);color:#fff;font-weight:700}
.nic{font-size:1.1rem;width:22px;text-align:center;flex-shrink:0}
.nbdg{margin-left:auto;background:var(--amber);color:#fff;font-size:.65rem;font-weight:800;padding:2px 7px;border-radius:99px}
.sbf{padding:14px 16px;border-top:1px solid rgba(255,255,255,.08);font-size:.75rem;opacity:.4}
#main{margin-left:240px;flex:1;display:flex;flex-direction:column;min-height:100vh}
#topbar{height:64px;background:var(--sf);border-bottom:1px solid var(--bd);display:flex;align-items:center;padding:0 28px;gap:16px;position:sticky;top:0;z-index:100;box-shadow:var(--s1)}
.tbt{font-size:1.1rem;font-weight:700;flex:1}
.tbs{display:flex;align-items:center;gap:6px;font-size:.78rem;color:var(--t2)}
.sdot{width:8px;height:8px;border-radius:50%;background:var(--g4);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.bic{width:36px;height:36px;border-radius:50%;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:1rem}
#cnt{flex:1;padding:28px;overflow-y:auto}
.vw{display:none}.vw.active{display:block;animation:fadeIn .25s ease}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.card{background:var(--sf);border-radius:var(--r);box-shadow:var(--s1);border:1px solid var(--bd);padding:22px}
.ct{font-size:1rem;font-weight:700;color:var(--g1);display:flex;align-items:center;gap:8px;margin-bottom:16px}
.ct small{font-size:.72rem;font-weight:500;color:var(--t3);margin-left:4px}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.mb20{margin-bottom:20px}
.stat{background:var(--sf);border-radius:var(--r);border:1px solid var(--bd);padding:18px 20px;display:flex;align-items:center;gap:16px;box-shadow:var(--s1);transition:transform var(--t),box-shadow var(--t)}
.stat:hover{transform:translateY(-2px);box-shadow:var(--s2)}
.si{width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0}
.ig{background:#e8f8ee}.ia{background:var(--ap)}.is{background:var(--sp)}.ip{background:var(--pp)}
.sv{font-size:1.7rem;font-weight:800;color:var(--tx);line-height:1}
.sl{font-size:.78rem;color:var(--t3);font-weight:500;margin-top:3px}
.pill{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:99px;font-size:.72rem;font-weight:700;white-space:nowrap}
.pg{background:#e8f8ee;color:var(--g2)}.pa{background:var(--ap);color:#a04000}
.pr{background:var(--rp);color:var(--red)}.ps{background:var(--sp);color:var(--sky)}
.pp2{background:var(--pp);color:var(--pu)}.pz{background:#f0f0f5;color:var(--t2)}
.btn{display:inline-flex;align-items:center;gap:7px;padding:9px 18px;border-radius:var(--rs);font-size:.875rem;font-weight:600;transition:all var(--t)}
.bp{background:linear-gradient(135deg,var(--g3),var(--g4));color:#fff;box-shadow:0 2px 8px rgba(30,132,73,.3)}
.bp:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(30,132,73,.4)}
.bo{background:transparent;border:1.5px solid var(--g4);color:var(--g3)}
.bo:hover{background:#e8f8ee}
.bd2{background:var(--rp);color:var(--red)}.bsm{padding:6px 13px;font-size:.78rem}
.fg{margin-bottom:14px}
.fl{display:block;font-size:.8rem;font-weight:600;color:var(--t2);margin-bottom:5px}
.fi,.fse,.fta{width:100%;padding:9px 13px;border:1.5px solid var(--bd);border-radius:var(--rs);font-size:.875rem;color:var(--tx);background:var(--sf);transition:border-color var(--t),box-shadow var(--t)}
.fi:focus,.fse:focus,.fta:focus{border-color:var(--g4);box-shadow:0 0 0 3px rgba(46,204,113,.15)}
.fta{resize:vertical;min-height:80px}
.fr{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.fr3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.tw{overflow-x:auto;border-radius:var(--rs)}
table{width:100%;border-collapse:collapse;font-size:.85rem}
thead th{background:var(--bg);padding:11px 14px;text-align:left;font-weight:700;font-size:.75rem;color:var(--t2);text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--bd)}
tbody tr{border-bottom:1px solid rgba(0,0,0,.04);transition:background var(--t)}
tbody tr:hover{background:#f8fdf9}
tbody td{padding:12px 14px;vertical-align:middle}
tbody tr:last-child{border-bottom:none}
.empty{text-align:center;padding:48px 24px;color:var(--t3)}
.eico{font-size:3rem;margin-bottom:12px}
.empty h3{font-size:1rem;font-weight:700;color:var(--t2);margin-bottom:6px}
.prg{height:7px;background:#e8ede8;border-radius:99px;overflow:hidden}
.prf{height:100%;background:linear-gradient(90deg,var(--g3),var(--g5));border-radius:99px;transition:width .8s}
#tc{position:fixed;bottom:24px;right:24px;display:flex;flex-direction:column;gap:10px;z-index:9999}
.toast{background:var(--g1);color:#fff;padding:12px 18px;border-radius:var(--rs);font-size:.85rem;font-weight:500;box-shadow:var(--s3);display:flex;align-items:center;gap:10px;animation:su .3s ease;max-width:320px}
.terr{background:var(--red)}.twrn{background:#e67e22}
@keyframes su{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
.mo{position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;z-index:500;backdrop-filter:blur(3px)}
.mo.open{display:flex;animation:fadeIn .2s ease}
.mdl{background:var(--sf);border-radius:var(--r);box-shadow:var(--s3);padding:28px;width:min(520px,95vw);max-height:90vh;overflow-y:auto;position:relative}
.mtt{font-size:1.1rem;font-weight:800;color:var(--g1);margin-bottom:20px}
.mft{display:flex;gap:10px;justify-content:flex-end;margin-top:20px}
.mcl{position:absolute;top:16px;right:16px;background:var(--bg);border:none;width:32px;height:32px;border-radius:50%;font-size:1.1rem;cursor:pointer;display:flex;align-items:center;justify-content:center}
.uz{border:2px dashed var(--g4);border-radius:var(--r);padding:32px 24px;text-align:center;cursor:pointer;transition:background var(--t),border-color var(--t);background:#f0fbf4}
.uz:hover,.uz.drag{background:#e2f7ea;border-color:var(--g3)}
.uico{font-size:2.5rem;margin-bottom:10px}
#uprev{display:none;margin-top:12px}
#uprev img{width:100%;max-height:200px;object-fit:cover;border-radius:var(--rs)}
.sg{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.stile{background:var(--bg);border-radius:var(--rs);padding:14px;border-left:4px solid #ccc;transition:transform var(--t)}
.stile:hover{transform:translateY(-1px)}
.stile.good{border-color:var(--g4)}.stile.warn{border-color:var(--amber)}.stile.bad{border-color:var(--red)}
.stv{font-size:1.5rem;font-weight:800}.stn{font-size:.72rem;font-weight:700;color:var(--t2);text-transform:uppercase}
.stu{font-size:.68rem;color:var(--t3)}.stt{font-size:.7rem;color:var(--t3);margin-top:4px}
.ri{display:flex;align-items:center;gap:12px;padding:12px;border-radius:var(--rs);background:var(--bg);border:1px solid var(--bd);margin-bottom:8px;transition:background var(--t)}
.ri:hover{background:#edf7f1}
.rrk{width:26px;height:26px;border-radius:8px;background:var(--g1);color:#fff;font-size:.72rem;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.ditem{display:flex;gap:14px;padding:14px;border-radius:var(--rs);background:var(--bg);border:1px solid var(--bd);margin-bottom:10px}
.scard{background:var(--sf);border-radius:var(--r);border:1px solid var(--bd);padding:18px;box-shadow:var(--s1);transition:transform var(--t),box-shadow var(--t)}
.scard:hover{transform:translateY(-2px);box-shadow:var(--s2)}
.spin{width:24px;height:24px;border:3px solid rgba(30,132,73,.2);border-top-color:var(--g4);border-radius:50%;animation:sp .7s linear infinite;flex-shrink:0}
@keyframes sp{to{transform:rotate(360deg)}}
.lo{display:flex;align-items:center;justify-content:center;gap:12px;padding:32px;color:var(--t3);font-size:.9rem}
.fb{display:flex;gap:10px;align-items:center;margin-bottom:18px;flex-wrap:wrap}
.fb .fi,.fb .fse{max-width:200px;padding:7px 12px}.fb .fi{flex:1;min-width:160px}
.hero{background:linear-gradient(135deg,var(--g1) 0%,var(--g3) 60%,var(--g4) 100%);border-radius:var(--r);padding:28px 32px;color:#fff;margin-bottom:24px;position:relative;overflow:hidden}
.hero h1{font-size:1.6rem;font-weight:800;margin-bottom:4px}
.hero p{opacity:.85;font-size:.9rem}
.sh{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
.sh h2{font-size:1rem;font-weight:700;color:var(--tx)}
#fsbar{background:var(--sf);border-radius:var(--r);padding:14px 18px;border:1px solid var(--bd);margin-bottom:20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
#fsbar label{font-size:.85rem;font-weight:600;color:var(--t2)}
#fsbar select{flex:1;min-width:200px;max-width:320px}
@media(max-width:900px){.g2,.g3,.g4{grid-template-columns:1fr}.fr,.fr3{grid-template-columns:1fr}#sb{transform:translateX(-100%)}#sb.open{transform:none}#main{margin-left:0}#cnt{padding:16px}}
@media(min-width:901px){#mtt{display:none}}
</style></head>"""

print(len(HTML_CSS))
