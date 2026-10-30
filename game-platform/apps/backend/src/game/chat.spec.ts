import { ChatGateway } from './chat.gateway';
import { CHAT_KEPT, CHAT_MAX_LENGTH, ChatService, cleanChatText } from './chat.service';
import type { TeamRoomGame } from './team-room';

// A game service that knows one seated socket per room
const fakeGame = (seats: Record<string, { roomId: string; playerId: string; name: string }>): TeamRoomGame =>
  ({ chatSender: (socketId: string, roomId: unknown) => (seats[socketId]?.roomId === roomId ? seats[socketId] : null) }) as unknown as TeamRoomGame;

function setup() {
  const chat = new ChatService();
  const casino = fakeGame({ s1: { roomId: 'ABC123', playerId: 'p1', name: 'Ana' } });
  const none = fakeGame({});
  const gateway = new ChatGateway(chat, casino as never, none as never, none as never, none as never);
  const emitted: { room: string; event: string; payload: unknown }[] = [];
  gateway.server = { to: (room: string) => ({ emit: (event: string, payload: unknown) => emitted.push({ room, event, payload }) }) } as never;
  const socket = (id: string) => ({ id }) as never;
  return { gateway, emitted, socket };
}

describe('chat text', () => {
  it('trims, folds whitespace, drops control characters and caps the length', () => {
    expect(cleanChatText('  hello \n\n  there  ')).toBe('hello there');
    expect(cleanChatText('a\u0007b')).toBe('ab');
    expect(cleanChatText('   ')).toBeNull();
    expect(cleanChatText(42)).toBeNull();
    expect(cleanChatText('x'.repeat(1000))).toHaveLength(CHAT_MAX_LENGTH);
  });

  it('keeps only the last messages of each room', () => {
    const chat = new ChatService();
    for (let i = 0; i < CHAT_KEPT + 10; i++) chat.add('dominoes', 'R1', { playerId: 'p', name: 'A' }, `m${i}`);
    const history = chat.history('dominoes', 'R1');
    expect(history).toHaveLength(CHAT_KEPT);
    expect(history[0]!.text).toBe('m10');
    expect(chat.history('dominoes', 'R2')).toEqual([]);
    expect(chat.history('five-in-a-row', 'R1')).toEqual([]); // rooms of different games never mix
  });
});

describe('chat gateway', () => {
  it('sends a seated player’s message to the room, with the public seat id only', () => {
    const { gateway, emitted, socket } = setup();
    const ack = gateway.send({ game: 'african-casino', roomId: 'ABC123', text: ' Bonjour ' }, socket('s1'));
    expect(ack).toEqual({ ok: true, message: expect.objectContaining({ playerId: 'p1', name: 'Ana', text: 'Bonjour' }) });
    expect(emitted).toEqual([{ room: 'ABC123', event: 'chat:message', payload: expect.objectContaining({ game: 'african-casino', roomId: 'ABC123' }) }]);
    expect(JSON.stringify(emitted)).not.toContain('s1'); // no socket id
    expect(gateway.history({ game: 'african-casino', roomId: 'ABC123' }, socket('s1'))).toEqual({ ok: true, messages: [expect.objectContaining({ text: 'Bonjour' })] });
  });

  it('refuses strangers, other rooms, unknown games and empty messages', () => {
    const { gateway, emitted, socket } = setup();
    expect(gateway.send({ game: 'african-casino', roomId: 'ABC123', text: 'hi' }, socket('s9'))).toEqual({ ok: false, code: 'NOT_SEATED' });
    expect(gateway.send({ game: 'african-casino', roomId: 'OTHER1', text: 'hi' }, socket('s1'))).toEqual({ ok: false, code: 'NOT_SEATED' });
    expect(gateway.send({ game: 'toString', roomId: 'ABC123', text: 'hi' }, socket('s1'))).toEqual({ ok: false, code: 'NOT_SEATED' });
    expect(gateway.send({ game: 'african-casino', roomId: 'ABC123', text: '   ' }, socket('s1'))).toEqual({ ok: false, code: 'EMPTY_MESSAGE' });
    expect(gateway.history({ game: 'african-casino', roomId: 'ABC123' }, socket('s9'))).toEqual({ ok: false, code: 'NOT_SEATED' });
    expect(emitted).toEqual([]);
  });

  it('limits each socket to 5 messages per 10 seconds', () => {
    const { gateway, socket } = setup();
    const acks = Array.from({ length: 6 }, (_, i) => gateway.send({ game: 'african-casino', roomId: 'ABC123', text: `m${i}` }, socket('s1')));
    expect(acks.slice(0, 5).every(a => a.ok)).toBe(true);
    expect(acks[5]).toEqual({ ok: false, code: 'RATE_LIMITED' });
  });
});
