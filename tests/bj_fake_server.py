"""Máy chủ Blackjack GIẢ LẬP cho test trình duyệt: cài lại đúng HỢP ĐỒNG và thuật toán của sql/12-blackjack.sql (không phải SQL thật).
handle(fn, params) -> dict giống phản hồi api_bj_* / api_history. Có thể đặt `script` (danh sách id lá bài theo thứ tự chia) để test xác định,
và các cờ lỗi để thử tình huống bất thường (network, sai kết quả...)."""
import math, random, time
SU = ["spades", "hearts", "diamonds", "clubs"]; RA = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]
val = lambda r: 11 if r == "A" else 10 if r in ("J", "Q", "K") else int(r)
def score(cs):
    t = sum(val(c.split("-")[1]) for c in cs); a = sum(c.endswith("-A") for c in cs)
    while t > 21 and a: t -= 10; a -= 1
    return t
R_ = [50.0, 47.1, 44.7, 43.6, 41.8, 40.1, 37.9, 35.8, 33.9, 32.1, 29.0, 26.1, 24.0, 22.5, 21.0]   # giống _bj_bias trong sql/12-blackjack.sql
G_ = [-0.55, -0.3, -0.1, 0, 0.15, 0.3, 0.5, 0.7, 0.9, 1.1, 1.5, 2.0, 2.5, 3.0, 4.0]
STEP = 1          # điểm % hồi phục mỗi ván thua (giống v_step)
def bias(rate):
    if rate >= R_[0]: return G_[0]
    if rate <= R_[-1]: return G_[-1]
    for i in range(len(R_) - 1):
        if R_[i + 1] <= rate <= R_[i]: return G_[i] + (G_[i + 1] - G_[i]) * (R_[i] - rate) / (R_[i] - R_[i + 1])
def r2(x): return round(x * 100) / 100

class FakeBJ:
    def __init__(self, balance=10.0, enabled=True, chain=(43.6, 41.6, 39.6, 37.5, 35.5)):
        self.balance = balance; self.enabled = enabled; self.chain = list(chain)
        self.wins = 0; self.rate = None; self.game = None; self.rows = []; self.calls = []; self.params = []
        self.grace = 5.0           # giống v_grace trong SQL: ván mở dưới mức này (giây) thì api_bj_start trả game_open, không phạt
        self.script = None          # danh sách id lá, dùng thay cho xáo bài
        self.fail = {}              # {"api_bj_hit": "network"} -> trả lỗi; {"api_bj_stand": "wrong_outcome"} -> kết quả sai (thử lệch đồng bộ)
        self.delay = {}

    # ---- tiện ích ----
    def _bal_range(self):
        b100 = round(self.balance * 100)
        mx = (b100 // 10) / 10; mn = max(0.1, (b100 // 40) / 10)
        return mn, mx
    def _pick(self, deck, hand, who):
        if self.script:                                   # lá do test chỉ định
            c = self.script.pop(0)
            if c in deck: deck.remove(c)
            return c
        g = self.game["bias"]
        ws = [math.exp(g if who == "p" else -g) if score(hand + [c]) > 21 else 1.0 for c in deck]
        c = random.choices(deck, ws)[0]; deck.remove(c); return c
    def _settle(self, outcome, dealer):
        g = self.game; bet = g["bet"]
        delta = {"win": bet, "blackjack": bet * 1.5, "push": 0}.get(outcome, -bet)
        g["row"]["reward"] = delta; g["row"]["outcome"] = outcome; g["row"]["abandoned"] = outcome == "abandoned"
        self.balance = r2(self.balance + delta + bet)          # đã trừ cược lúc chia -> cộng lại phần thực nhận (cược + lãi)
        idx = min(self.wins, len(self.chain) - 1)
        if outcome in ("win", "blackjack"): self.wins += 1; self.rate = None
        elif outcome != "push" and idx >= 1:
            base, cap = self.chain[idx], self.chain[idx - 1]
            self.rate = max(base, min((base if self.rate is None else self.rate) + STEP, cap))
        g["status"] = "done"; self.game = None
        return delta
    def _state_nums(self):
        mn, mx = self._bal_range()
        return {"balanceK": self.balance, "minBet": mn, "maxBet": mx}

    # ---- RPC ----
    def handle(self, fn, params):
        self.calls.append(fn); self.params.append((fn, params))
        f = self.fail.get(fn)
        if f == "network": return {"ok": False, "error": "network"}
        if f == "auth": return {"ok": False, "error": "auth"}
        return getattr(self, fn)(params or {})

    def api_bj_state(self, p):
        o = None
        if self.game: o = {"bet": self.game["bet"], "player": self.game["pc"], "dealer": self.game["dc"], "playerScore": score(self.game["pc"])}
        r = {"ok": True, "enabled": self.enabled, "step": 0.1, "open": o,
             "difficulty": {"step": min(self.wins, len(self.chain) - 1) + 1, "steps": len(self.chain)}}
        r.update(self._state_nums()); return r

    def api_bj_start(self, p):
        if not self.enabled: return {"ok": False, "error": "disabled"}
        if self.game:
            if time.monotonic() - self.game["t"] < self.grace: return {"ok": False, "error": "game_open"}
            self._settle("abandoned", self.game["dc"])
        mn, mx = self._bal_range(); bet = p.get("p_bet")
        if mx < 0.1: return {"ok": False, "error": "no_balance", "balanceK": self.balance}
        if bet is None or bet < mn - 1e-9 or bet > mx + 1e-9 or abs(bet * 10 - round(bet * 10)) > 1e-9:
            return {"ok": False, "error": "bad_bet", "minBet": mn, "maxBet": mx, "balanceK": self.balance}
        idx = min(self.wins, len(self.chain) - 1)
        pct = self.rate if self.rate is not None else self.chain[idx]
        deck = [s + "-" + r for s in SU for r in RA]; random.shuffle(deck)
        if self.script: seq = [self.script.pop(0) for _ in range(4)]; [deck.remove(c) for c in seq if c in deck]
        else: seq = [deck.pop(0), deck.pop(0), deck.pop(0), deck.pop(0)]
        pc, up, hole = [seq[0], seq[2]], seq[1], seq[3]
        self.balance = r2(self.balance - bet)
        row = {"kind": "blackjack", "reward": -bet, "outcome": None, "bet": bet}; self.rows.insert(0, row)
        self.game = {"bet": bet, "bias": bias(pct), "hole": hole, "deck": deck, "pc": pc, "dc": [up], "row": row, "status": "open", "t": time.monotonic()}
        pn, dn = score(pc) == 21, score([up, hole]) == 21
        if pn or dn:
            out = "push" if pn and dn else "blackjack" if pn else "dealer_blackjack"
            delta = self._settle(out, [up, hole])
            return {"ok": True, "bet": bet, "player": pc, "dealer": [up, hole], "playerScore": score(pc), "done": True, "outcome": out, "delta": delta, "balanceK": self.balance}
        return {"ok": True, "bet": bet, "player": pc, "dealer": [up], "playerScore": score(pc), "done": False, "balanceK": self.balance}

    def api_bj_hit(self, p):
        g = self.game
        if not g: return {"ok": False, "error": "no_game"}
        if score(g["pc"]) >= 21: return {"ok": False, "error": "cannot_hit"}
        c = self._pick(g["deck"], g["pc"], "p"); g["pc"].append(c); s = score(g["pc"])
        if s > 21:
            d = g["dc"] + [g["hole"]]; delta = self._settle("bust", d)
            return {"ok": True, "card": c, "playerScore": s, "done": True, "outcome": "bust", "dealer": d, "delta": delta, "balanceK": self.balance}
        return {"ok": True, "card": c, "playerScore": s, "done": False}

    def api_bj_stand(self, p):
        g = self.game
        if not g: return {"ok": False, "error": "no_game"}
        d = g["dc"] + [g["hole"]]
        while score(d) < 17 and len(d) < 14: d.append(self._pick(g["deck"], d, "d"))
        ps, ds = score(g["pc"]), score(d)
        res = "win" if ds > 21 or ds < ps else "push" if ds == ps else "lose"
        reported = res
        if self.fail.get("api_bj_stand") == "wrong_outcome": reported = "lose" if res != "lose" else "win"
        delta = self._settle(res, d)
        return {"ok": True, "done": True, "outcome": reported, "dealer": d, "dealerScore": ds, "playerScore": ps, "delta": delta, "balanceK": self.balance}

    def api_bj_abandon(self, p):
        if self.game: self._settle("abandoned", self.game["dc"])
        return {"ok": True, "balanceK": self.balance}

    def api_history(self, p):
        items = [{"at": "2026-11-17T10:00:00Z", "kind": "blackjack", "level": "blackjack", "total": 0, "solved": 0, "wheel": None, "spun": True,
                  "status": "finished", "abandoned": bool(r.get("abandoned")), "bagPending": False, "outcome": r["outcome"], "bet": r["bet"],
                  "rewardLabel": None, "rewardK": r["reward"]} for r in self.rows]
        return {"ok": True, "paidK": 0, "rewardK": sum(r["reward"] for r in self.rows), "items": items}


# ---- Phần host (admin_*) cho test trang host: cài lại hợp đồng của sql/12-blackjack.sql ----
def _admin_login(self, p): return {"ok": True}
def _admin_export(self, p): return {"ok": True, "questions": {"easy": [], "hard": [], "impossible": []}, "wheels": {}, "bagValues": {}, "settings": {}, "loseImage": None}
def _admin_lixi_get(self, p): return {"ok": True, "values": [2, 3, 4, 5, 6, 7, 8, 9, 10]}
def _admin_settings(self, p):
    return {"ok": True, "costs": {"easy": 1, "hard": 1, "impossible": 0}, "startTurns": 3, "freeSpins": 1, "impossiblePrize": "100K", "gachaRate": 5,
            "bjEnabled": self.enabled, "bjChain": self.chain}
def _admin_players(self, p):
    reward = sum(r["reward"] for r in self.rows)
    return {"ok": True, "players": [{"id": "p1", "name": "Nam", "turns": 3, "freeUsed": 0, "active": True, "lixi": None, "paidK": 0, "impLocked": False,
                                      "gachaLeft": 1, "gachaRate": None, "bjWins": self.wins, "bjRate": self.rate, "rewardK": reward, "plays": len(self.rows), "lastAt": None}]}
def _admin_history(self, p):
    return {"ok": True, "items": [{"at": "2026-11-17T10:00:00Z", "kind": "blackjack", "level": "blackjack", "total": 0, "solved": 0, "wheel": None, "spun": True,
                                   "status": "finished", "cost": 0, "outcome": r["outcome"], "bet": r["bet"], "rewardLabel": None, "rewardK": r["reward"]} for r in self.rows]}
def _admin_bj_config(self, p):
    chain = p.get("p_chain")
    if chain is not None:        # giống kiểm tra trong SQL
        if not isinstance(chain, list) or not 1 <= len(chain) <= 10 or any(not isinstance(x, (int, float)) or isinstance(x, bool) or x < 0 or x > 100 for x in chain):
            return {"ok": False, "error": "bad_chain"}
        self.chain = chain
    if p.get("p_enabled") is not None: self.enabled = bool(p["p_enabled"])
    return {"ok": True}
def _admin_bj_reset_wins(self, p):
    if p.get("p_id") != "p1": return {"ok": False, "error": "no_player"}
    self.wins = 0; self.rate = None; return {"ok": True}
for _n, _f in [("admin_login", _admin_login), ("admin_export", _admin_export), ("admin_lixi_get", _admin_lixi_get), ("admin_settings", _admin_settings),
               ("admin_players", _admin_players), ("admin_history", _admin_history), ("admin_bj_config", _admin_bj_config), ("admin_bj_reset_wins", _admin_bj_reset_wins)]:
    setattr(FakeBJ, _n, _f)
