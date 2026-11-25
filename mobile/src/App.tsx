import NetInfo from "@react-native-community/netinfo";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View, useColorScheme } from "react-native";
import { ApiError, api, enqueue, login, sync } from "./api";
import { cacheJob, cachedJobs, getKv, ops, setKv, wipe, type Op } from "./store";

type R = Record<string, any>;
const light = { bg: "#f5f6f8", card: "#ffffff", border: "#e2e5ea", text: "#1c2430", muted: "#6b7482", accent: "#1f5ea8", ok: "#24724a", warn: "#8a5a00", danger: "#b0261e", onAccent: "#ffffff" };
const dark = { bg: "#12161c", card: "#1a1f27", border: "#2b323d", text: "#e6e9ee", muted: "#8e98a6", accent: "#5b9be0", ok: "#6cc391", warn: "#e0b45a", danger: "#ee8a83", onAccent: "#0d1520" };
const human = (s: unknown) => String(s ?? "").replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());

export default function App() {
  const c = useColorScheme() === "dark" ? dark : light;
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<R | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    getKv("user").then((u) => { setUser(u ? JSON.parse(u) : null); setReady(true); });
    return NetInfo.addEventListener((s) => setOnline(!!s.isConnected));
  }, []);
  useEffect(() => { if (online && user) sync().catch(() => undefined); }, [online, user]);

  const s = styles(c);
  if (!ready) return <View style={s.center}><ActivityIndicator color={c.accent} /></View>;
  return (
    <SafeAreaView style={s.screen}>
      <StatusBar barStyle={c === dark ? "light-content" : "dark-content"} />
      {!user ? <Login c={c} onDone={setUser} /> : jobId ? <Job c={c} id={jobId} online={online} onBack={() => setJobId(null)} />
        : <Jobs c={c} online={online} user={user} onOpen={setJobId} onLogout={async () => { await wipe(); setUser(null); }} />}
    </SafeAreaView>
  );
}

function Login({ c, onDone }: { c: typeof light; onDone: (u: R) => void }) {
  const s = styles(c);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <View style={[s.pad, { flex: 1, justifyContent: "center", gap: 12 }]}>
      <Text style={s.h1}>OPES Maintain</Text>
      <Text style={s.muted}>Technician sign-in</Text>
      {error && <Text style={{ color: c.danger }} accessibilityRole="alert">{error}</Text>}
      <TextInput style={s.input} placeholder="Email" placeholderTextColor={c.muted} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} accessibilityLabel="Email" />
      <TextInput style={s.input} placeholder="Password" placeholderTextColor={c.muted} secureTextEntry value={password} onChangeText={setPassword} accessibilityLabel="Password" />
      <Btn c={c} primary label={busy ? "Signing in…" : "Sign in"} onPress={async () => {
        setBusy(true); setError(null);
        try { onDone(await login(email.trim(), password)); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      }} />
    </View>
  );
}

function SyncBar({ c, online, onSynced }: { c: typeof light; online: boolean; onSynced: () => void }) {
  const s = styles(c);
  const [items, setItems] = useState<Op[]>([]);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => { ops().then(setItems); }, []);
  useEffect(() => { load(); const h = setInterval(load, 1000); return () => clearInterval(h); }, [load]);
  const pending = items.filter((o) => o.state === "QUEUED" || o.state === "SYNCING").length;
  const issues = items.filter((o) => ["CONFLICT", "REJECTED", "REQUIRES_ONLINE_REVIEW"].includes(o.state)).length;
  return (
    <View style={s.card}>
      <View style={s.rowBetween}>
        <Text style={{ color: online ? c.ok : c.warn, fontWeight: "600" }}>{online ? "● Online" : "● Offline — changes saved on device"}</Text>
        <View style={s.row}>
          <Btn c={c} small label={`Queue ${pending}${issues ? ` · ${issues} issue(s)` : ""}`} onPress={() => setOpen(!open)} />
          <Btn c={c} small primary label="Sync" disabled={!online || !pending} onPress={async () => {
            try { const r = await sync(); load(); onSynced(); if (r.problems) Alert.alert("Sync", `${r.problems} change(s) need attention`); } catch (e) { Alert.alert("Sync failed", (e as Error).message); }
          }} />
        </View>
      </View>
      {open && items.map((o) => (
        <View key={o.id} style={[s.rowBetween, { paddingTop: 8 }]}>
          <Text style={[s.text, { flex: 1 }]}>{o.label}{o.message ? `\n${o.message}` : ""}</Text>
          <Text style={{ color: o.state === "ACCEPTED" ? c.ok : o.state === "QUEUED" || o.state === "SYNCING" ? c.warn : c.danger }}>{human(o.state)}</Text>
        </View>
      ))}
    </View>
  );
}

function Jobs({ c, online, user, onOpen, onLogout }: { c: typeof light; online: boolean; user: R; onOpen: (id: string) => void; onLogout: () => void }) {
  const s = styles(c);
  const [items, setItems] = useState<R[] | null>(null);
  const [stale, setStale] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await api<{ items: R[] }>("/technician/my-work");
      setItems(r.items);
      setStale(false);
      for (const w of r.items) await cacheJob(String(w.id), { wo: w });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { await setKv("user", null); onLogout(); return; }
      if (e instanceof ApiError && e.status === 403) { Alert.alert("Access revoked", e.message); await wipe(); onLogout(); return; }
      setItems((await cachedJobs()).map((j) => JSON.parse(j.data).wo));
      setStale(true);
    }
  }, [onLogout]);
  useEffect(() => { load(); }, [load, online]);
  return (
    <View style={{ flex: 1 }}>
      <View style={[s.pad, s.rowBetween]}>
        <View><Text style={s.h1}>My work</Text><Text style={s.muted}>{user.fullName} · {human(user.role)}</Text></View>
        <Btn c={c} small label="Sign out" onPress={onLogout} />
      </View>
      <View style={s.padX}><SyncBar c={c} online={online} onSynced={load} /></View>
      {stale && <Text style={[s.padX, { color: c.warn }]}>Showing last-known data from this device.</Text>}
      {!items ? <ActivityIndicator style={{ marginTop: 24 }} color={c.accent} /> : (
        <FlatList data={items} keyExtractor={(w) => String(w.id)} contentContainerStyle={s.pad} onRefresh={load} refreshing={false}
          ListEmptyComponent={<Text style={s.muted}>No assigned work.</Text>}
          renderItem={({ item: w }) => (
            <Pressable style={s.card} onPress={() => onOpen(String(w.id))} accessibilityRole="button" accessibilityLabel={`${w.number} ${w.title}`}>
              <View style={s.rowBetween}><Text style={s.muted}>{w.number}</Text><Text style={{ color: c.accent, fontWeight: "600" }}>{human(w.status)}</Text></View>
              <Text style={[s.text, { fontWeight: "600", marginVertical: 4 }]}>{w.title}</Text>
              <Text style={s.muted}>{w.assetIdLabel ?? "No asset"} · {human(w.priority)}</Text>
              {w.permitRequired && <Text style={{ color: c.warn, marginTop: 4 }}>Permit required — online check before start</Text>}
            </Pressable>
          )} />
      )}
    </View>
  );
}

function Job({ c, id, online, onBack }: { c: typeof light; id: string; online: boolean; onBack: () => void }) {
  const s = styles(c);
  const [wo, setWo] = useState<R | null>(null);
  const [tasks, setTasks] = useState<R[]>([]);
  const [meters, setMeters] = useState<R[]>([]);
  const [reading, setReading] = useState({ meterId: "", value: "" });
  const [timer, setTimer] = useState<string | null>(null);
  const [tech, setTech] = useState<R | null>(null);
  const load = useCallback(async () => {
    try {
      const w = await api<R>(`/work-orders/${id}`);
      const [t, m, me] = await Promise.all([
        api<{ items: R[] }>(`/work-tasks?workOrderId=${id}&size=100&sort=sequence,asc`),
        w.assetId ? api<{ items: R[] }>(`/meters?assetId=${w.assetId}&size=20`) : Promise.resolve({ items: [] }),
        api<{ technician: R | null }>("/technician/my-work"),
      ]);
      setWo(w); setTasks(t.items); setMeters(m.items); setTech(me.technician);
      await cacheJob(id, { wo: w, tasks: t.items, meters: m.items });
    } catch {
      const c2 = (await cachedJobs()).find((j) => j.id === id);
      if (c2) { const d = JSON.parse(c2.data); setWo(d.wo); setTasks(d.tasks ?? []); setMeters(d.meters ?? []); }
    }
    setTimer(await getKv(`timer.${id}`));
  }, [id]);
  useEffect(() => { load(); }, [load]);
  if (!wo) return <View style={s.center}><ActivityIndicator color={c.accent} /></View>;

  const queue = async (type: string, label: string, payload: R) => {
    await enqueue(type, `${wo.number}: ${label}`, { workOrderId: id, ...payload }, wo.version);
    if (online) { try { await sync(); } catch { /* stays queued */ } load(); } else Alert.alert("Saved offline", label);
  };
  const pending = tasks.filter((t) => t.required && t.status === "PENDING").length;
  return (
    <ScrollView contentContainerStyle={[s.pad, { gap: 12 }]}>
      <Btn c={c} small label="‹ My work" onPress={onBack} />
      <SyncBar c={c} online={online} onSynced={load} />
      <View style={s.card}>
        <Text style={s.muted}>{wo.number} · {human(wo.status)}</Text>
        <Text style={s.h1}>{wo.title}</Text>
        {wo.description ? <Text style={s.text}>{wo.description}</Text> : null}
        <Text style={s.muted}>{wo.assetSnapshot ?? wo.assetIdLabel}</Text>
      </View>
      <View style={s.card}>
        <Text style={s.h2}>Safety briefing</Text>
        <Text style={s.text}>{wo.permitRequired ? "A work permit is required. Starting re-validates the permit online." : "No permit required. Follow site LOTO procedures and wear required PPE."}</Text>
      </View>
      <View style={[s.card, { gap: 8 }]}>
        {wo.status === "DISPATCHED" && <Btn c={c} primary label="Start work" disabled={!online && wo.permitRequired} onPress={() => queue("WO_TRANSITION", "Start work", { to: "IN_PROGRESS" })} />}
        {wo.status === "IN_PROGRESS" && <Btn c={c} primary label={pending ? `Complete (${pending} task(s) left)` : "Submit completion"} disabled={pending > 0} onPress={() => queue("WO_TRANSITION", "Submit completion", { to: "WORK_COMPLETED" })} />}
        <Btn c={c} label={timer ? `Stop timer (since ${new Date(timer).toLocaleTimeString()})` : "Start labor timer"} onPress={async () => {
          if (!timer) { const now = new Date().toISOString(); await setKv(`timer.${id}`, now); setTimer(now); return; }
          if (!tech) { Alert.alert("No technician profile linked to your account"); return; }
          await queue("TIME_ENTRY", "Labor time", { technicianId: tech.id, startedAt: timer, endedAt: new Date().toISOString(), laborType: "REGULAR" });
          await setKv(`timer.${id}`, null); setTimer(null);
        }} />
      </View>
      <View style={s.card}>
        <Text style={s.h2}>Checklist</Text>
        {tasks.map((t) => (
          <View key={t.id} style={[s.rowBetween, { paddingVertical: 8, borderTopWidth: 1, borderColor: c.border }]}>
            <Text style={[s.text, { flex: 1 }]}>{t.status === "DONE" ? "✓ " : t.status === "FAILED" ? "✗ " : "○ "}{t.description}</Text>
            {wo.status === "IN_PROGRESS" && t.status === "PENDING" && (
              <View style={s.row}>
                <Btn c={c} small label="Done" onPress={() => queue("TASK_RECORD", `Task ${t.sequence} done`, { taskId: t.id, status: "DONE" })} />
                <Btn c={c} small label="Failed" onPress={() => queue("TASK_RECORD", `Task ${t.sequence} failed`, { taskId: t.id, status: "FAILED" })} />
              </View>
            )}
          </View>
        ))}
      </View>
      {meters.length > 0 && (
        <View style={[s.card, { gap: 8 }]}>
          <Text style={s.h2}>Meter reading</Text>
          <View style={[s.row, { flexWrap: "wrap" }]}>{meters.map((m) => <Btn key={m.id} c={c} small primary={reading.meterId === m.id} label={`${m.name} (${m.unit})`} onPress={() => setReading({ ...reading, meterId: m.id })} />)}</View>
          <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Value" placeholderTextColor={c.muted} value={reading.value} onChangeText={(v) => setReading({ ...reading, value: v })} accessibilityLabel="Reading value" />
          <Btn c={c} label="Record reading" disabled={!reading.meterId || !reading.value} onPress={async () => {
            await queue("METER_READING", `Meter reading ${reading.value}`, { meterId: reading.meterId, value: reading.value, readingAt: new Date().toISOString(), source: "MOBILE" });
            setReading({ meterId: "", value: "" });
          }} />
        </View>
      )}
    </ScrollView>
  );
}

function Btn({ c, label, onPress, primary, small, disabled }: { c: typeof light; label: string; onPress: () => void; primary?: boolean; small?: boolean; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }}
      style={{ minHeight: small ? 32 : 44, paddingHorizontal: small ? 10 : 14, borderRadius: 6, borderWidth: 1, alignItems: "center", justifyContent: "center",
        borderColor: primary ? c.accent : c.border, backgroundColor: primary ? c.accent : c.card, opacity: disabled ? 0.5 : 1 }}>
      <Text style={{ color: primary ? c.onAccent : c.text, fontWeight: "600", fontSize: small ? 13 : 15 }}>{label}</Text>
    </Pressable>
  );
}

const styles = (c: typeof light) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.bg },
  pad: { padding: 16 },
  padX: { paddingHorizontal: 16 },
  card: { backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 8, padding: 14, marginBottom: 10 },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  h1: { fontSize: 20, fontWeight: "600", color: c.text },
  h2: { fontSize: 16, fontWeight: "600", color: c.text, marginBottom: 6 },
  text: { fontSize: 15, color: c.text },
  muted: { fontSize: 13, color: c.muted },
  input: { height: 44, borderWidth: 1, borderColor: c.border, borderRadius: 6, paddingHorizontal: 12, color: c.text, backgroundColor: c.card },
});
