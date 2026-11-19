#!/usr/bin/env python3
"""Mô phỏng THUẬT TOÁN của sql/12-blackjack.sql bằng Python (KHÔNG phải chạy SQL thật):
bài chia thật, thiên lệch nhẹ theo g (lá làm quá 21: người chơi e^g, nhà cái e^-g), bảng đổi % -> g, hồi phục +1%.
Dùng để hiệu chuẩn bảng _bj_bias và kiểm tra: người chơi giỏi thắng nhiều hơn người chơi ẩu; in cả EV (lãi/lỗ trung bình trên 1 đồng cược:
thắng +1, Blackjack tự nhiên +1,5, hòa 0, thua/quá 21/nhà cái Blackjack −1).
Bảng R/G dưới đây = đường cong làm mượt (đa thức bậc 5) từ ~20 điểm đo 60.000–120.000 ván/điểm bằng chiến thuật cơ bản.
Chạy: python3 tests/blackjack-sql-sim.py"""
import random, math
from collections import Counter
RA=['A','2','3','4','5','6','7','8','9','10','J','Q','K']
val=lambda r: 11 if r=='A' else 10 if r in 'JQK' else int(r)
def score(cs):
    t=sum(val(c) for c in cs); a=cs.count('A')
    while t>21 and a: t-=10; a-=1
    return t
def is_soft(cs): return 'A' in cs and sum(1 if c=='A' else val(c) for c in cs)+10<=21
R=[50.0,47.1,44.7,43.6,41.8,40.1,37.9,35.8,33.9,32.1,29.0,26.1,24.0,22.5,21.0]
G=[-0.55,-0.3,-0.1,0,0.15,0.3,0.5,0.7,0.9,1.1,1.5,2.0,2.5,3.0,4.0]     # giống _bj_bias
STEP=1                                                                     # điểm % hồi phục mỗi ván thua (giống v_step)
CHAIN=[43.6,41.6,39.6,37.5,35.5]                                           # chuỗi mặc định = EV mục tiêu -2, -6, -10, -14, -18 %
EV_TARGET=[-2,-6,-10,-14,-18]
PAY={'win':1,'blackjack':1.5,'push':0}
def bias(rate):
    if rate>=R[0]: return G[0]
    if rate<=R[-1]: return G[-1]
    for i in range(len(R)-1):
        if R[i+1]<=rate<=R[i]: return G[i]+(G[i+1]-G[i])*(R[i]-rate)/(R[i]-R[i+1])
def pick(deck,hand,who,g):
    ws=[math.exp(g if who=='p' else -g) if score(hand+[c])>21 else 1.0 for c in deck]
    return deck.pop(random.choices(range(len(deck)),ws)[0])
def basic(h,up):
    t=score(h); u=val(up)
    if is_soft(h): return t<=17 or (t==18 and u>=9)
    if t<=11: return True
    if t==12: return not(4<=u<=6)
    if t<=16: return not(2<=u<=6)
    return False
naive=lambda h,u: score(h)<17
rnd=lambda h,u: random.random()<.5
def play(g,pol):
    deck=[r for r in RA for _ in range(4)]; random.shuffle(deck)
    p=[deck.pop(),deck.pop()]; d=[deck.pop(),deck.pop()]
    pn,dn=score(p)==21,score(d)==21
    if pn or dn: return 'push' if pn and dn else 'blackjack' if pn else 'dealer_blackjack'
    while score(p)<21 and pol(p,d[0]):
        p.append(pick(deck,p,'p',g))
        if score(p)>21: return 'bust'
    while score(d)<17: d.append(pick(deck,d,'d',g))
    ps,ds=score(p),score(d)
    return 'win' if ds>21 or ps>ds else 'push' if ps==ds else 'lose'
WIN=('win','blackjack')
def after(chain,wins,rate,out):                     # giống _bj_settle
    idx=min(wins,len(chain)-1)
    if out in WIN: return wins+1,None
    if out!='push' and idx>=1:
        base,cap=chain[idx],chain[idx-1]
        return wins,max(base,min((base if rate is None else rate)+STEP,cap))
    return wins,rate
if __name__=='__main__':
    import sys
    random.seed(11); N=int(sys.argv[1]) if len(sys.argv)>1 else 50000; chain=CHAIN
    def measure(g,pol,n):
        ev=w=0
        for _ in range(n):
            o=play(g,pol); ev+=PAY.get(o,-1); w+=o in WIN
        return 100*w/n,100*ev/n
    print('Bậc | % mục tiêu | g     | EV mục tiêu | chuẩn: thắng% / EV%  | stand-17: thắng% / EV% | ẩu 50/50: thắng% / EV%   (EV = lãi/lỗ TB trên 1 đồng cược; sai số ~±0,3 điểm)')
    for i,r in enumerate(chain):
        g=bias(r); b=measure(g,basic,2*N); n_=measure(g,naive,N); u=measure(g,rnd,N)
        print(f'{i+1:>3} | {r:>10} | {g:+.2f} | {EV_TARGET[i]:>10}% | {b[0]:>5.1f}% / {b[1]:>+6.1f}%  | {n_[0]:>6.1f}% / {n_[1]:>+6.1f}%    | {u[0]:>6.1f}% / {u[1]:>+6.1f}%')
    c=Counter(play(0,basic) for _ in range(N)); print('Blackjack tự nhiên ở g=0: %.1f%% ván (lý thuyết ~4.8%%); nhà cái Blackjack: %.1f%%'%(100*c['blackjack']/N,100*c['dealer_blackjack']/N))
    w,r=1,None; t=[]
    for _ in range(7): w,r=after(chain,w,r,'lose'); t.append(r)
    print('Hồi phục từ bậc 2 (%s), thua liên tiếp:'%chain[1],t,'(trần = bậc trước %s; mỗi ván thua +%s điểm)'%(chain[0],STEP))
    print('Thắng ->',after(chain,1,chain[1]+1,'win'),'| hòa ->',after(chain,1,chain[1]+1,'push'),'| bậc 5 thua x2 ->',after(chain,4,None,'lose'))
