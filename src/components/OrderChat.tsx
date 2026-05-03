import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Send } from 'lucide-react';
import type { Id } from '../../convex/_generated/dataModel';

interface Props {
  orderId: Id<'orders'>;
  senderType: 'customer' | 'rider';
  contactNumber?: string;
  isCompleted?: boolean;
}

const OrderChat: React.FC<Props> = ({ orderId, senderType, contactNumber, isCompleted = false }) => {
  const messages = useQuery(api.messages.listByOrder, { orderId, contactNumber }) ?? [];
  const send = useMutation(api.messages.send);
  const markRead = useMutation(api.messages.markRead);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const markReadRef = useRef(markRead);
  useEffect(() => {
    markReadRef.current = markRead;
  }, [markRead]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    markReadRef.current({ orderId, contactNumber }).catch(() => {});
  }, [messages.length, orderId, contactNumber]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await send({ orderId, senderType, contactNumber, text: trimmed });
      setText('');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-80 bg-white rounded-xl border">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-8">No messages yet. Say hello!</p>
        ) : (
          messages.map((m) => {
            const mine = m.senderType === senderType;
            return (
              <div key={m._id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${mine ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-900'}`}>
                  {m.text}
                </div>
              </div>
            );
          })
        )}
      </div>
      {isCompleted ? (
        <div className="border-t p-3 text-center text-xs text-gray-400">
          This delivery has been completed — chat is closed.
        </div>
      ) : (
        <form onSubmit={handleSend} className="border-t p-2 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message…"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 focus:border-transparent text-sm"
            maxLength={1000}
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="bg-red-600 text-white p-2 rounded-lg hover:bg-red-700 disabled:opacity-50"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      )}
    </div>
  );
};

export default OrderChat;
