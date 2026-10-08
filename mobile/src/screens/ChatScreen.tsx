import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { storage } from '../lib/storage';
import { BASE_URL as API_BASE, WS_URL } from '../lib/api';

interface Conversation {
  id: string; type: string;
  otherUsers: Array<{ userId: string; userName: string; userEmail: string; userRole: string }>;
  lastMessage: { id: string; senderId: string; content: string; createdAt: string; senderName: string } | null;
  unreadCount: number; updatedAt: string;
}

interface Message {
  id: string; conversationId: string; senderId: string; content: string; leadId: string | null;
  status: string; createdAt: string; senderName: string; senderRole: string;
}

const AVATAR_COLORS = ['#22c55e', '#3b82f6', '#f97316', '#8b5cf6', '#ec4899'];

export default function ChatScreen() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const intentionalCloseRef = useRef(false);

  const getHeaders = async () => {
    const token = await storage.getToken();
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  };

  const fetchConversations = useCallback(async () => {
    try {
      const headers = await getHeaders();
      const res = await fetch(`${API_BASE}/api/chat/conversations`, { headers });
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  const connectWebSocket = useCallback(async () => {
    const token = await storage.getToken();
    if (!token) return;
    // Close any previous socket without triggering its reconnect
    if (wsRef.current) {
      intentionalCloseRef.current = true;
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }
    intentionalCloseRef.current = false;
    try {
      const ws = new WebSocket(`${WS_URL}/ws/chat?token=${token}`);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'message' && selectedConv && data.message.conversationId === selectedConv.id) {
            setMessages(prev => [...prev, data.message]);
          }
          if (data.type === 'message') fetchConversations();
        } catch {}
      };
      ws.onclose = () => {
        if (intentionalCloseRef.current) return;
        setTimeout(() => { if (!intentionalCloseRef.current) connectWebSocket(); }, 3000);
      };
      wsRef.current = ws;
    } catch {}
  }, [selectedConv, fetchConversations]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      intentionalCloseRef.current = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connectWebSocket]);

  const fetchMessages = useCallback(async (convId: string) => {
    try {
      const headers = await getHeaders();
      const res = await fetch(`${API_BASE}/api/chat/conversations/${convId}/messages`, { headers });
      const data = await res.json();
      setMessages(data.messages || []);
      await fetch(`${API_BASE}/api/chat/conversations/${convId}/read`, { method: 'POST', headers });
      fetchConversations();
    } catch {}
  }, [fetchConversations]);

  const selectConversation = (conv: Conversation) => { setSelectedConv(conv); fetchMessages(conv.id); };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConv || sending) return;
    const content = newMessage.trim();
    setNewMessage(''); setSending(true);
    try {
      const headers = await getHeaders();
      const res = await fetch(`${API_BASE}/api/chat/conversations/${selectedConv.id}/messages`, {
        method: 'POST', headers, body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (data.message) setMessages(prev => [...prev, data.message]);
      fetchConversations();
    } catch {}
    setSending(false);
  };

  const formatTime = (iso: string) => {
    try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
  };

  const getAvatarColor = (name: string) => AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];

  if (!selectedConv) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Chat</Text>
          <Ionicons name="search" size={22} color="#111827" />
        </View>
        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color="#14b8a6" /></View>
        ) : conversations.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="chatbubbles-outline" size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>No conversations yet</Text>
          </View>
        ) : (
          <FlatList data={conversations} keyExtractor={(item) => item.id} renderItem={({ item }) => {
            const other = item.otherUsers[0];
            if (!other) return null;
            return (
              <TouchableOpacity style={styles.convItem} onPress={() => selectConversation(item)}>
                <View style={[styles.avatar, { backgroundColor: getAvatarColor(other.userName) }]}>
                  <Text style={styles.avatarText}>{other.userName.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.convInfo}>
                  <View style={styles.convRow}>
                    <Text style={styles.convName}>{other.userName}</Text>
                    {item.lastMessage && <Text style={styles.convTime}>{formatTime(item.lastMessage.createdAt)}</Text>}
                  </View>
                  <View style={styles.convRow}>
                    <Text style={styles.convPreview} numberOfLines={1}>{item.lastMessage?.content || 'No messages'}</Text>
                    {item.unreadCount > 0 && (
                      <View style={styles.unreadBadge}><Text style={styles.unreadText}>{item.unreadCount}</Text></View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }} />
        )}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.chatHeader}>
        <TouchableOpacity onPress={() => { setSelectedConv(null); setMessages([]); }}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <View style={[styles.avatar, { backgroundColor: getAvatarColor(selectedConv.otherUsers[0]?.userName || ''), width: 36, height: 36, borderRadius: 18 }]}>
          <Text style={[styles.avatarText, { fontSize: 14 }]}>{selectedConv.otherUsers[0]?.userName?.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.chatName}>{selectedConv.otherUsers[0]?.userName}</Text>
          <Text style={styles.chatStatus}>Online</Text>
        </View>
        <Ionicons name="call" size={22} color="#14b8a6" />
      </View>

      <FlatList
        ref={flatListRef} data={messages} keyExtractor={(item) => item.id}
        style={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          const isMe = item.senderId !== selectedConv.otherUsers[0]?.userId;
          return (
            <View style={[styles.bubble, isMe ? styles.myBubble : styles.theirBubble]}>
              <Text style={[styles.bubbleText, isMe ? styles.myBubbleText : styles.theirBubbleText]}>{item.content}</Text>
              <Text style={[styles.bubbleTime, isMe ? styles.myBubbleTime : styles.theirBubbleTime]}>
                {formatTime(item.createdAt)}{isMe && item.status === 'READ' ? ' âœ“âœ“' : isMe ? ' âœ“' : ''}
              </Text>
            </View>
          );
        }}
      />

      <View style={styles.inputBar}>
        <TouchableOpacity style={styles.attachBtn}><Ionicons name="attach" size={22} color="#6b7280" /></TouchableOpacity>
        <TextInput style={styles.input} value={newMessage} onChangeText={setNewMessage} placeholder="Type a message..." placeholderTextColor="#9ca3af" multiline />
        <TouchableOpacity style={[styles.sendBtn, !newMessage.trim() && { opacity: 0.5 }]} onPress={sendMessage} disabled={!newMessage.trim() || sending}>
          <Ionicons name="send" size={20} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  emptyText: { fontSize: 14, color: '#9ca3af' },
  convItem: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { fontSize: 16, fontWeight: '600', color: '#ffffff' },
  convInfo: { flex: 1 },
  convRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  convName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  convTime: { fontSize: 12, color: '#9ca3af' },
  convPreview: { fontSize: 13, color: '#6b7280', flex: 1, marginTop: 4 },
  unreadBadge: { backgroundColor: '#ef4444', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6, marginLeft: 8 },
  unreadText: { fontSize: 11, fontWeight: '600', color: '#ffffff' },
  chatHeader: { flexDirection: 'row', alignItems: 'center', paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', gap: 12 },
  chatName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  chatStatus: { fontSize: 12, color: '#22c55e' },
  messageList: { flex: 1, padding: 16 },
  bubble: { maxWidth: '78%', padding: 12, borderRadius: 18, marginBottom: 8 },
  myBubble: { alignSelf: 'flex-end', backgroundColor: '#14b8a6', borderBottomRightRadius: 4 },
  theirBubble: { alignSelf: 'flex-start', backgroundColor: '#f3f4f6', borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  myBubbleText: { color: '#ffffff' },
  theirBubbleText: { color: '#111827' },
  bubbleTime: { fontSize: 11, marginTop: 4 },
  myBubbleTime: { color: 'rgba(255,255,255,0.7)', textAlign: 'right' },
  theirBubbleTime: { color: '#9ca3af' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  attachBtn: { padding: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 100, color: '#111827' },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#14b8a6', justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
});
