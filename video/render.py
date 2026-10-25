#!/usr/bin/env python3
import json, math, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

W,H,FPS = 1280,720,24
BG=(11,16,32); PANEL=(18,25,46); INK=(226,232,240); SUB=(148,163,184)
BLUE=(91,141,239); TEAL=(23,195,178); RED=(239,83,80); GREEN=(52,199,120); GOLD=(240,190,90)
FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONTB="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
MONO="/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
MONOB="/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
_fc={}
def f(path,sz):
    k=(path,sz)
    if k not in _fc: _fc[k]=ImageFont.truetype(path,sz)
    return _fc[k]
def ease(x): return 0 if x<=0 else 1 if x>=1 else (1-math.cos(x*math.pi))/2
def lerp(a,b,t): return tuple(int(a[i]+(b[i]-a[i])*t) for i in range(3))
def mix(c,t): return lerp(BG,c,t)
def new(): 
    im=Image.new("RGB",(W,H),BG); return im, ImageDraw.Draw(im)
def ctext(d,cx,y,s,fnt,fill,anchor="mm"):
    d.text((cx,y),s,font=fnt,fill=fill,anchor=anchor)
def rr(d,box,r,fill=None,outline=None,width=1):
    d.rounded_rectangle(box,radius=r,fill=fill,outline=outline,width=width)

def draw_logo(d,cx,cy,s,col):
    # rounded card with a tab + arrow (matches assets/logo.svg)
    w=s; h=int(s*0.66)
    x0,y0=cx-w//2, cy-h//2
    rr(d,[x0,y0,x0+w,y0+h],int(s*0.12),outline=col,width=max(3,s//28))
    tw=int(w*0.42); tx=cx-tw//2; th=int(s*0.16)
    d.line([(tx,y0),(tx,y0-th),(tx+tw,y0-th),(tx+tw,y0)],fill=col,width=max(3,s//28),joint="curve")
    # three dots -> arrow
    dx=x0+int(w*0.14)
    for i,yy in enumerate([cy-h*0.18,cy,cy+h*0.18]):
        d.ellipse([dx-5,yy-5,dx+5,yy+5],fill=col)
    ax0=cx-int(w*0.14); ax1=cx+int(w*0.30)
    d.line([(ax0,cy),(ax1,cy)],fill=col,width=max(3,s//30))
    d.line([(ax1,cy),(ax1-18,cy-16)],fill=col,width=max(3,s//30))
    d.line([(ax1,cy),(ax1-18,cy+16)],fill=col,width=max(3,s//30))

def footer(d):
    ctext(d,W//2,H-34,"github.com/devx-agent/devx-agenttab",f(MONO,20),SUB)

# ---------------- scenes ----------------
def s_title(p):  # 0..1
    im,d=new()
    a=ease(min(1,p*2.2))
    draw_logo(d,W//2,268,170,mix(TEAL,a))
    ctext(d,W//2,420,"AgentTab",f(FONTB,76),mix(INK,a))
    b=ease(min(1,max(0,(p-0.25)*2)))
    ctext(d,W//2,486,"Pay-per-request agent-to-agent settlement on HashKey Chain",f(FONT,30),mix(BLUE,b))
    c=ease(min(1,max(0,(p-0.5)*2)))
    ctext(d,W//2,548,"HashKey Chain Horizon  ·  Agent Payments & A2A Settlement",f(FONT,23),mix(SUB,c))
    return im

def agent_box(d,cx,cy,label,col,sub=None):
    w,h=230,96
    rr(d,[cx-w//2,cy-h//2,cx+w//2,cy+h//2],18,fill=PANEL,outline=col,width=3)
    ctext(d,cx,cy-(10 if sub else 0),label,f(FONTB,26),INK)
    if sub: ctext(d,cx,cy+22,sub,f(FONT,18),SUB)

def s_problem(p):
    im,d=new()
    ctext(d,W//2,70,"The problem",f(FONTB,40),INK)
    ctext(d,W//2,118,"Agents pay each other per API call — tiny amounts, thousands of times",f(FONT,24),SUB)
    ay,by=360,360
    agent_box(d,250,ay,"Payer agent",BLUE)
    agent_box(d,1030,by,"Service agent",TEAL)
    # flying calls, each dragging a big gas coin
    n=6
    for i in range(n):
        ph=(p*1.0*n - i)
        if ph<0 or ph>1.4: continue
        t=ease(min(1,ph))
        x=250+ (1030-250)*t; y=ay
        d.ellipse([x-9,y-9,x+9,y+9],fill=INK)
        # gas coin bigger than payment
        gc=mix(RED,min(1,ph))
        d.ellipse([x-26,y-58,x+26,y-6],outline=gc,width=4)
        ctext(d,x,y-32,"gas",f(FONTB,16),gc)
    if p>0.55:
        a=ease(min(1,(p-0.55)*3))
        rr(d,[W//2-250,470,W//2+250,560],16,outline=mix(RED,a),width=3)
        ctext(d,W//2,515,"one tx per call  →  too slow, gas ≫ payment",f(FONTB,26),mix(RED,a))
    footer(d); return im

def s_solution(p):
    im,d=new()
    ctext(d,W//2,66,"The idea: one tab, off-chain vouchers",f(FONTB,38),INK)
    agent_box(d,230,250,"Payer agent",BLUE,"hot key signs")
    agent_box(d,1050,250,"Service agent",TEAL,"402 paywall")
    # contract
    rr(d,[W//2-180,470,W//2+180,585],18,fill=PANEL,outline=TEAL,width=3)
    ctext(d,W//2,505,"AgentTab.sol",f(FONTB,26),INK)
    ctext(d,W//2,545,"escrow · HashKey Chain 177",f(FONT,18),SUB)
    # step 1 openTab (first 25%)
    o=ease(min(1,p*4))
    d.line([(230,300),(W//2-120,470)],fill=mix(GOLD,o),width=3)
    if o>0.2: ctext(d,360,405,"openTab(deposit)",f(FONTB,20),mix(GOLD,o))
    # vouchers rising cumulative
    calls=int(min(25, max(0,(p-0.25)/0.6)*25))
    for i in range(min(calls,12)):
        t=i/12.0; x=300+ (980-300)*t; y=250-0 + 8*math.sin(i)
        col=lerp(BLUE,TEAL,t)
        d.line([(x,235),(x+40,235)],fill=col,width=3)
    if p>0.25:
        ctext(d,W//2,186,"each call = signed voucher, cumulative amount ↑  (0 gas)",f(FONT,22),TEAL)
    # counters
    rr(d,[70,H-150,470,H-70],14,fill=PANEL,outline=(40,50,80),width=2)
    ctext(d,110,H-110,"paid calls",f(FONT,20),SUB,anchor="lm")
    ctext(d,440,H-110,str(calls),f(MONOB,34),TEAL,anchor="rm")
    rr(d,[W-470,H-150,W-70,H-70],14,fill=PANEL,outline=(40,50,80),width=2)
    ctext(d,W-440,H-110,"on-chain tx (agent)",f(FONT,20),SUB,anchor="lm")
    ctext(d,W-100,H-110,"2",f(MONOB,34),GOLD,anchor="rm")
    return im

def s_settle(p):
    im,d=new()
    ctext(d,W//2,70,"Settle thousands of calls in one transaction",f(FONTB,36),INK)
    agent_box(d,1050,250,"Service agent",TEAL)
    rr(d,[W//2-180,470,W//2+180,585],18,fill=PANEL,outline=TEAL,width=3)
    ctext(d,W//2,527,"AgentTab.sol",f(FONTB,26),INK)
    # many vouchers collapsing into one arrow
    collapse=ease(min(1,p*1.6))
    for i in range(12):
        t=i/11.0
        sx=150+ t*300; sy=200+ i*18
        ex,ey=W//2-120,250
        x=sx+(ex-sx)*collapse; y=sy+(ey-sy)*collapse
        col=lerp(BLUE,TEAL,t)
        d.line([(x,y),(x+34,y)],fill=col,width=3)
    if p>0.45:
        a=ease(min(1,(p-0.45)*3))
        d.line([(W//2,300),(W//2,460)],fill=mix(GOLD,a),width=5)
        d.line([(W//2,460),(W//2-14,440)],fill=mix(GOLD,a),width=5)
        d.line([(W//2,460),(W//2+14,440)],fill=mix(GOLD,a),width=5)
        ctext(d,W//2,360,"redeemBatch(ids, cumulatives, sigs)",f(MONOB,22),mix(GOLD,a))
    if p>0.6:
        b=ease(min(1,(p-0.6)*3))
        d.line([(W//2+180,527),(940,300)],fill=mix(GREEN,b),width=4)
        ctext(d,760,400,"USDC → service",f(FONTB,22),mix(GREEN,b))
    footer(d); return im

def term_frame(lines, cursor=True, title="demo — node demo/local-e2e.mjs"):
    im,d=new()
    # window chrome
    rr(d,[60,50,W-60,H-50],14,fill=(8,11,22),outline=(40,50,80),width=2)
    rr(d,[60,50,W-60,92],14,fill=(22,28,48))
    d.rectangle([60,80,W-60,92],fill=(22,28,48))
    for i,c in enumerate([(255,95,86),(255,189,46),(39,201,63)]):
        d.ellipse([86+i*26,64,100+i*26,78],fill=c)
    ctext(d,W//2,71,title,f(MONO,18),SUB)
    fnt=f(MONO,21); x0,y=92,112; lh=30
    for ln in lines:
        txt, col = ln
        d.text((x0,y),txt,font=fnt,fill=col); y+=lh
    if cursor and lines:
        # block cursor at end of last line
        last=lines[-1][0]
        w=d.textlength(last,font=fnt)
        d.rectangle([x0+w+3,y-lh+3,x0+w+15,y-6],fill=INK)
    return im

def color_for(line):
    if line.startswith("$"): return INK
    if "402" in line: return GOLD
    if "settled" in line or "OK" in line: return GREEN
    if "rejected" in line.lower() or "replayed" in line: return RED
    if line.startswith("AgentTab") or line.startswith("mUSD"): return TEAL
    return SUB

def gen():
    # scene timeline: (func, seconds)
    cap=json.load(open("video/demo_capture.json"))
    scenes=[("title",5),("problem",8),("solution",9),("settle",6)]
    for name,secs in scenes:
        nf=int(secs*FPS)
        for i in range(nf):
            p=i/(nf-1) if nf>1 else 1
            if name=="title": yield s_title(p)
            elif name=="problem": yield s_problem(p)
            elif name=="solution": yield s_solution(p)
            elif name=="settle": yield s_settle(p)
    # terminal scene (real demo)
    cmd="$ node demo/local-e2e.mjs"
    # type the command
    for i in range(len(cmd)+1):
        yield term_frame([(cmd[:i],INK)])
    for _ in range(int(0.4*FPS)): yield term_frame([(cmd,INK)])
    # reveal real output lines; compress the ~7.5s gap into a spinner
    shown=[(cmd,INK)]
    spin="|/-\\"
    # group: lines at t<2 appear immediately, then spinner while 'running 25 paid calls', then the rest
    early=[r for r in cap if r['t']<3]
    late=[r for r in cap if r['t']>=3]
    for r in early:
        shown.append((r['line'][:96], color_for(r['line'])))
        for _ in range(int(0.5*FPS)): yield term_frame(shown)
    # spinner ~4s
    base=shown+[("running 25 paid calls (open tab + sign vouchers) ",SUB)]
    for k in range(int(4*FPS)):
        base[-1]=("  "+spin[k%4]+" running 25 paid calls (open tab, sign & verify vouchers)…",SUB)
        yield term_frame(base,cursor=False)
    for r in late:
        shown.append((r['line'][:96], color_for(r['line'])))
        for _ in range(int(1.0*FPS)): yield term_frame(shown)
    for _ in range(int(2*FPS)): yield term_frame(shown)
    # outro
    of=int(8*FPS)
    for i in range(of):
        p=i/(of-1)
        im,d=new()
        a=ease(min(1,p*2))
        draw_logo(d,W//2,150,110,mix(TEAL,a))
        ctext(d,W//2,250,"Safe by construction",f(FONTB,36),mix(INK,a))
        bullets=["Voucher can never exceed the deposit  (proven by a fuzz test)",
                 "Bound to chain + contract + tab — no replay",
                 "Signing hot key holds no funds; deposit is separate",
                 "Humans top agents up via HSP (HMAC + ES256K cart mandate)"]
        for j,b in enumerate(bullets):
            bb=ease(min(1,max(0,(p-0.15-j*0.12)*4)))
            ctext(d,W//2,320+j*44,"•  "+b,f(FONT,24),mix(SUB,bb))
        c=ease(min(1,max(0,(p-0.6)*3)))
        ctext(d,W//2,560,"github.com/devx-agent/devx-agenttab",f(MONOB,26),mix(BLUE,c))
        ctext(d,W//2,604,"Deployed on HashKey Chain (177)",f(FONT,22),mix(SUB,c))
        yield im

def main():
    out="video/agenttab_demo.mp4"
    ff=subprocess.Popen(["ffmpeg","-y","-f","rawvideo","-pix_fmt","rgb24","-s",f"{W}x{H}","-r",str(FPS),
        "-i","-","-c:v","libx264","-pix_fmt","yuv420p","-crf","20","-preset","medium","-movflags","+faststart",out],
        stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    n=0
    for im in gen():
        ff.stdin.write(im.tobytes()); n+=1
    ff.stdin.close(); ff.wait()
    print("frames",n,"duration_s",round(n/FPS,1))

main()
