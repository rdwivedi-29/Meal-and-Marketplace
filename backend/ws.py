from typing import Dict, Set
from fastapi import WebSocket

class Hub:
    def __init__(self):
        self.rooms: Dict[str, Set[WebSocket]] = {}

    async def join(self, room: str, ws: WebSocket):
        await ws.accept()
        self.rooms.setdefault(room, set()).add(ws)

    def leave(self, room: str, ws: WebSocket):
        if room in self.rooms and ws in self.rooms[room]:
            self.rooms[room].remove(ws)
            if not self.rooms[room]:
                del self.rooms[room]

    async def broadcast(self, room: str, msg: dict):
        if room not in self.rooms:
            return
        dead = []
        for ws in list(self.rooms[room]):
            try:
                await ws.send_json(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.leave(room, ws)

hub = Hub()
