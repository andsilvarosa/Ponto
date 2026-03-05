import React, { useEffect, useState } from 'react';
import { 
  Clock, 
  CalendarDays, 
  Plus, 
  TrendingUp, 
  Moon, 
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  LayoutDashboard,
  Settings2,
  Edit2,
  Trash2,
  ChevronLeft,
  Activity,
  X,
  History,
  Calendar,
  BarChart3,
  Settings,
  PlusCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { minutesToTime, calculateDay } from './utils/timeCalculations';

interface TimeEntry {
  date: string;
  entry_1: string;
  exit_1: string;
  entry_2: string;
  exit_2: string;
  entry_3: string;
  exit_3: string;
  entry_4: string;
  exit_4: string;
  entry_5: string;
  exit_5: string;
}

interface Holiday {
  date: string;
  name: string;
  type: string;
}

export default function App() {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<'history' | 'calendar' | 'stats'>('history');
  const [previousBalance, setPreviousBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isSyncingCompany, setIsSyncingCompany] = useState(false);

  // Form state
  const [formData, setFormData] = useState<TimeEntry>({
    date: new Date().toISOString().split('T')[0],
    entry_1: '08:00',
    exit_1: '12:00',
    entry_2: '13:00',
    exit_2: '17:20',
    entry_3: '',
    exit_3: '',
    entry_4: '',
    exit_4: '',
    entry_5: '',
    exit_5: '',
  });

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    fetchData();
    return () => clearInterval(timer);
  }, []);

  const fetchData = async () => {
    try {
      const [entriesRes, settingsRes] = await Promise.all([
        fetch('/api/entries'),
        fetch('/api/settings')
      ]);
      
      if (!entriesRes.ok || !settingsRes.ok) {
        const status = !entriesRes.ok ? entriesRes.status : settingsRes.status;
        const errData = await (entriesRes.ok ? settingsRes.json() : entriesRes.json());
        console.error(`Erro na resposta do servidor (Status ${status}):`, errData);
        throw new Error(errData.details || errData.error || `Erro ao buscar dados do servidor: Status ${status}`);
      }

      const entriesData = await entriesRes.json();
      const settingsData = await settingsRes.json();
      
      setEntries(Array.isArray(entriesData.entries) ? entriesData.entries : []);
      setHolidays(Array.isArray(entriesData.holidays) ? entriesData.holidays : []);
      setPreviousBalance(parseInt(settingsData.previous_balance || '0'));
    } catch (err) {
      console.error('Erro ao buscar dados:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ previous_balance: previousBalance }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao salvar configurações');
      }
      setIsSettingsOpen(false);
      fetchData();
    } catch (err: any) {
      console.error('Erro ao salvar configurações:', err);
      alert(err.message || 'Erro ao salvar configurações');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao salvar marcação');
      }
      setIsModalOpen(false);
      setIsEditing(false);
      fetchData();
    } catch (err: any) {
      console.error('Erro ao salvar:', err);
      alert(err.message || 'Erro ao salvar marcação');
    }
  };

  const handleDelete = async (date: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta marcação?')) return;
    try {
      await fetch(`/api/entries/${date}`, { method: 'DELETE' });
      fetchData();
    } catch (err) {
      console.error('Erro ao deletar:', err);
    }
  };

  const handleEdit = (entry: TimeEntry) => {
    setFormData(entry);
    setIsEditing(true);
    setIsModalOpen(true);
  };

  const openNewEntryModal = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      entry_1: '08:00',
      exit_1: '12:00',
      entry_2: '13:00',
      exit_2: '17:20',
      entry_3: '',
      exit_3: '',
      entry_4: '',
      exit_4: '',
      entry_5: '',
      exit_5: '',
    });
    setIsEditing(false);
    setIsModalOpen(true);
  };

  const syncHolidays = async () => {
    try {
      await fetch('/api/sync-feriados');
      fetchData();
    } catch (err) {
      console.error('Erro ao sincronizar feriados:', err);
    }
  };

  const syncCompanyPonto = async () => {
    setIsSyncingCompany(true);
    try {
      const response = await fetch('/api/sync-ponto-empresa', { method: 'POST' });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Erro na sincronização (Status ${response.status}):`, errorText);
        alert(`Erro ao sincronizar: Status ${response.status}. Verifique os logs do console.`);
        throw new Error(`O servidor retornou um erro: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        alert(`${data.count} dias foram sincronizados do site da empresa!`);
        fetchData(); // Atualiza a tela com os novos dados
      } else {
        alert('Erro ao puxar dados da empresa: ' + data.error);
      }
    } catch (err: any) {
      console.error('Erro na requisição:', err);
      alert('Erro ao sincronizar: ' + err.message);
    } finally {
      setIsSyncingCompany(false);
    }
  };

  const getDayStatus = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const holiday = holidays.find(h => h.date === dateStr);
    return { isWeekend, holiday };
  };

  const calculateStats = () => {
    let totalBalance = previousBalance;
    let totalNight = 0;
    let workedToday = 0;

    const todayStr = new Date().toISOString().split('T')[0];
    
    (entries || []).forEach(entry => {
      const { isWeekend, holiday } = getDayStatus(entry.date);
      const entriesArr = [entry.entry_1, entry.entry_2, entry.entry_3, entry.entry_4, entry.entry_5];
      const exitsArr = [entry.exit_1, entry.exit_2, entry.exit_3, entry.exit_4, entry.exit_5];
      const result = calculateDay(entriesArr, exitsArr, isWeekend || !!holiday);
      totalBalance += result.balance;
      totalNight += result.nightMinutesFicta;
      if (entry.date === todayStr) {
        workedToday = result.totalWorked;
      }
    });

    return { totalBalance, totalNight, workedToday };
  };

  const stats = calculateStats();

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Sidebar / Navigation */}
      <nav className="fixed left-0 top-0 h-full w-20 border-r border-white/5 bg-black/20 backdrop-blur-xl flex flex-col items-center py-8 gap-8 z-50">
        <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <Clock className="text-black w-6 h-6" />
        </div>
        <div className="flex flex-col gap-6 mt-8">
          <button 
            onClick={() => setActiveTab('history')}
            className={`p-3 rounded-xl transition-all ${activeTab === 'history' ? 'text-emerald-500 bg-emerald-500/10' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <LayoutDashboard className="w-6 h-6" />
          </button>
          <button 
            onClick={() => setActiveTab('calendar')}
            className={`p-3 rounded-xl transition-all ${activeTab === 'calendar' ? 'text-emerald-500 bg-emerald-500/10' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <CalendarDays className="w-6 h-6" />
          </button>
          <button 
            onClick={() => setActiveTab('stats')}
            className={`p-3 rounded-xl transition-all ${activeTab === 'stats' ? 'text-emerald-500 bg-emerald-500/10' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <Activity className="w-6 h-6" />
          </button>
          <button 
            className="p-3 text-zinc-500 hover:text-zinc-300 transition-all" 
            onClick={() => setIsSettingsOpen(true)}
          >
            <Settings2 className="w-6 h-6" />
          </button>
        </div>
      </nav>

      <main className="pl-20 max-w-7xl mx-auto p-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
          <div>
            <h1 className="text-4xl font-bold tracking-tight mb-2">Ponto CLT</h1>
            <p className="text-zinc-500 flex items-center gap-2">
              <CalendarDays className="w-4 h-4" />
              {currentTime.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>

          <div className="flex items-center gap-6 bg-white/5 p-4 rounded-3xl border border-white/10 backdrop-blur-md">
            <div className="text-right hidden sm:block">
              <p className="text-3xl font-mono font-medium text-emerald-400">
                {currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </p>
              <p className="text-xs text-zinc-500 uppercase tracking-widest">Brasília, DF</p>
            </div>
            
            <div className="flex flex-col gap-2">
              <button 
                onClick={syncCompanyPonto}
                disabled={isSyncingCompany}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-sm shadow-lg shadow-indigo-500/20 active:scale-95 disabled:opacity-50"
              >
                <Activity className="w-4 h-4" />
                {isSyncingCompany ? 'PUXANDO DADOS...' : 'SYNC EMPRESA'}
              </button>
              
              <button 
                onClick={openNewEntryModal}
                className="bg-emerald-500 hover:bg-emerald-400 text-black px-6 py-2 rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-sm shadow-lg shadow-emerald-500/20 active:scale-95"
              >
                <Plus className="w-4 h-4" />
                PONTO MANUAL
              </button>
            </div>
          </div>
        </header>

        {/* Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white/5 border border-white/10 p-6 rounded-[2rem] backdrop-blur-sm">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-emerald-500/10 rounded-2xl">
                <TrendingUp className="w-5 h-5 text-emerald-500" />
              </div>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Saldo Total</span>
            </div>
            <p className={`text-3xl font-mono font-bold ${stats.totalBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {stats.totalBalance >= 0 ? '+' : ''}{minutesToTime(stats.totalBalance)}
            </p>
            <p className="text-xs text-zinc-500 mt-2">Acumulado no período</p>
          </div>

          <div className="bg-white/5 border border-white/10 p-6 rounded-[2rem] backdrop-blur-sm">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-indigo-500/10 rounded-2xl">
                <Moon className="w-5 h-5 text-indigo-400" />
              </div>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Adicional Noturno</span>
            </div>
            <p className="text-3xl font-mono font-bold text-indigo-400">
              {minutesToTime(stats.totalNight)}
            </p>
            <p className="text-xs text-zinc-500 mt-2">Horas fictas calculadas</p>
          </div>

          <div className="bg-white/5 border border-white/10 p-6 rounded-[2rem] backdrop-blur-sm">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-zinc-500/10 rounded-2xl">
                <Activity className="w-5 h-5 text-zinc-400" />
              </div>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Hoje</span>
            </div>
            <p className="text-3xl font-mono font-bold text-zinc-100">
              {minutesToTime(stats.workedToday)}
            </p>
            <p className="text-xs text-zinc-500 mt-2">Tempo trabalhado hoje</p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'history' && (
            <motion.section 
              key="history"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-[#121214] border border-white/[0.04] rounded-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-white/[0.04] flex justify-between items-center">
                <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-100 flex items-center gap-2">
                  <LayoutDashboard className="w-4 h-4 text-emerald-500" />
                  Espelho de Ponto
                </h2>
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest bg-white/5 px-3 py-1 rounded-full">
                  Março 2026
                </span>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-zinc-600 text-[10px] font-bold uppercase tracking-widest border-b border-white/[0.04]">
                      <th className="px-8 py-5">Data</th>
                      <th className="px-4 py-5">Registros</th>
                      <th className="px-4 py-5">Total</th>
                      <th className="px-4 py-5">Saldo</th>
                      <th className="px-8 py-5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.02]">
                    {(entries || []).map((entry, idx) => {
                      const { isWeekend, holiday } = getDayStatus(entry.date);
                      const entriesArr = [entry.entry_1, entry.entry_2, entry.entry_3, entry.entry_4, entry.entry_5];
                      const exitsArr = [entry.exit_1, entry.exit_2, entry.exit_3, entry.exit_4, entry.exit_5];
                      const result = calculateDay(entriesArr, exitsArr, isWeekend || !!holiday);
                      
                      return (
                        <tr 
                          key={entry.date} 
                          className={`group hover:bg-white/[0.02] transition-colors ${isWeekend || holiday ? 'bg-emerald-500/[0.02]' : ''}`}
                        >
                          <td className="px-8 py-5">
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-zinc-300">
                                {new Date(entry.date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                              </span>
                              <span className="text-[10px] text-zinc-600 uppercase font-bold">
                                {new Date(entry.date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short' })}
                                {holiday && ` • ${holiday.name}`}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-5">
                            <div className="flex flex-wrap gap-1.5 max-w-md">
                              {[1, 2, 3, 4, 5].map(i => {
                                const e = (entry as any)[`entry_${i}`];
                                const s = (entry as any)[`exit_${i}`];
                                if (!e && !s) return null;
                                return (
                                  <div key={i} className="flex items-center gap-1 bg-white/[0.03] px-2 py-0.5 rounded border border-white/[0.05] text-[10px] font-mono">
                                    <span className="text-emerald-500/70">{e || '--:--'}</span>
                                    <span className="text-zinc-700">·</span>
                                    <span className="text-rose-500/70">{s || '--:--'}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                          <td className="px-4 py-5">
                            <span className="text-xs font-mono text-zinc-400">
                              {minutesToTime(result.totalWorked)}
                            </span>
                          </td>
                          <td className="px-4 py-5">
                            <span className={`text-xs font-mono font-bold ${result.balance >= 0 ? 'text-emerald-500/80' : 'text-rose-500/80'}`}>
                              {result.balance > 0 ? '+' : ''}{minutesToTime(result.balance)}
                            </span>
                          </td>
                          <td className="px-8 py-5 text-right">
                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => handleEdit(entry)}
                                className="p-1.5 text-zinc-600 hover:text-emerald-500 hover:bg-emerald-500/5 rounded-md transition-all"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => handleDelete(entry.date)}
                                className="p-1.5 text-zinc-600 hover:text-rose-500 hover:bg-rose-500/5 rounded-md transition-all"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </motion.section>
          )}

          {activeTab === 'calendar' && (
            <motion.section 
              key="calendar"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-[#121214] border border-white/[0.04] rounded-2xl p-8"
            >
              <div className="flex justify-between items-center mb-10">
                <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-100 flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-emerald-500" />
                  Calendário
                </h2>
                <div className="flex items-center gap-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">
                  <button className="p-1.5 hover:bg-white/5 rounded-lg"><ChevronLeft className="w-4 h-4" /></button>
                  <span>Março 2026</span>
                  <button className="p-1.5 hover:bg-white/5 rounded-lg"><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-3">
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
                  <div key={day} className="text-center text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">
                    {day}
                  </div>
                ))}
                {Array.from({ length: 31 }).map((_, i) => {
                  const day = i + 1;
                  const dateStr = `2026-03-${String(day).padStart(2, '0')}`;
                  const entry = (entries || []).find(e => e.date === dateStr);
                  const { isWeekend, holiday } = getDayStatus(dateStr);
                  
                  let balance = 0;
                  if (entry) {
                    const entriesArr = [entry.entry_1, entry.entry_2, entry.entry_3, entry.entry_4, entry.entry_5];
                    const exitsArr = [entry.exit_1, entry.exit_2, entry.exit_3, entry.exit_4, entry.exit_5];
                    const result = calculateDay(entriesArr, exitsArr, isWeekend || !!holiday);
                    balance = result.balance;
                  }

                  return (
                    <div 
                      key={day} 
                      className={`aspect-square rounded-xl border p-2 flex flex-col justify-between transition-all hover:bg-white/[0.02]
                        ${entry ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-transparent border-white/[0.03]'}
                        ${isWeekend || holiday ? 'bg-emerald-500/[0.03] border-emerald-500/10' : ''}
                      `}
                    >
                      <span className={`text-[10px] font-bold ${isWeekend || holiday ? 'text-emerald-500/60' : 'text-zinc-600'}`}>
                        {day}
                      </span>
                      {entry && (
                        <div className={`text-[9px] font-mono font-bold ${balance >= 0 ? 'text-emerald-500/80' : 'text-rose-500/80'}`}>
                          {balance > 0 ? '+' : ''}{minutesToTime(balance)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.section>
          )}

          {activeTab === 'stats' && (
            <motion.section 
              key="stats"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-[#121214] border border-white/[0.04] rounded-2xl p-8">
                  <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-100 mb-8 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-500" />
                    Fluxo de Saldo
                  </h3>
                  <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={(entries || []).slice().reverse()}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                        <XAxis 
                          dataKey="date" 
                          stroke="#ffffff20" 
                          fontSize={9} 
                          tickFormatter={(val) => val.split('-')[2]}
                        />
                        <YAxis stroke="#ffffff20" fontSize={9} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#121214', border: '1px solid #ffffff08', borderRadius: '12px', fontSize: '10px' }}
                          itemStyle={{ color: '#fff' }}
                        />
                        <Bar dataKey={(entry) => {
                          const { isWeekend, holiday } = getDayStatus(entry.date);
                          const entriesArr = [entry.entry_1, entry.entry_2, entry.entry_3, entry.entry_4, entry.entry_5];
                          const exitsArr = [entry.exit_1, entry.exit_2, entry.exit_3, entry.exit_4, entry.exit_5];
                          return calculateDay(entriesArr, exitsArr, isWeekend || !!holiday).balance;
                        }} name="Saldo (min)">
                          {(entries || []).slice().reverse().map((entry, index) => {
                            const { isWeekend, holiday } = getDayStatus(entry.date);
                            const entriesArr = [entry.entry_1, entry.entry_2, entry.entry_3, entry.entry_4, entry.entry_5];
                            const exitsArr = [entry.exit_1, entry.exit_2, entry.exit_3, entry.exit_4, entry.exit_5];
                            const balance = calculateDay(entriesArr, exitsArr, isWeekend || !!holiday).balance;
                            return <Cell key={`cell-${index}`} fill={balance >= 0 ? '#10b98180' : '#f43f5e80'} />;
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-[#121214] border border-white/[0.04] rounded-2xl p-8">
                  <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-100 mb-8 flex items-center gap-2">
                    <Moon className="w-4 h-4 text-indigo-400" />
                    Composição
                  </h3>
                  <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Normal', value: stats.workedToday > 0 ? 440 : 0 },
                            { name: 'Extra', value: Math.max(0, stats.totalBalance) },
                            { name: 'Noturna', value: stats.totalNight }
                          ]}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={75}
                          paddingAngle={8}
                          dataKey="value"
                        >
                          <Cell fill="#10b98160" stroke="none" />
                          <Cell fill="#3b82f660" stroke="none" />
                          <Cell fill="#818cf860" stroke="none" />
                        </Pie>
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#121214', border: '1px solid #ffffff08', borderRadius: '12px', fontSize: '10px' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-center gap-6 mt-4">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                      <div className="w-2 h-2 rounded-full bg-emerald-500/60" /> Normal
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                      <div className="w-2 h-2 rounded-full bg-blue-500/60" /> Extra
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                      <div className="w-2 h-2 rounded-full bg-indigo-400/60" /> Noturna
                    </div>
                  </div>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-[#121212] border border-white/10 w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-white/5 bg-white/5">
                <h2 className="text-2xl font-bold">{isEditing ? 'Editar Marcação' : 'Registrar Marcação'}</h2>
                <p className="text-zinc-500 text-sm mt-1">
                  {isEditing ? 'Ajuste os horários da marcação existente.' : 'Preencha os horários do dia selecionado.'}
                </p>
              </div>
              
              <form onSubmit={handleSave} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Data</label>
                  <input 
                    type="date" 
                    required
                    value={formData.date}
                    onChange={e => setFormData({...formData, date: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 focus:outline-none focus:border-emerald-500/50 transition-colors text-white"
                  />
                </div>

                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="grid grid-cols-2 gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Entrada {i}</label>
                      <input 
                        type="time" 
                        value={(formData as any)[`entry_${i}`]}
                        onChange={e => setFormData({...formData, [`entry_${i}`]: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500/50 transition-colors text-white text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Saída {i}</label>
                      <input 
                        type="time" 
                        value={(formData as any)[`exit_${i}`]}
                        onChange={e => setFormData({...formData, [`exit_${i}`]: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500/50 transition-colors text-white text-sm"
                      />
                    </div>
                  </div>
                ))}

                <div className="pt-4 flex gap-3 sticky bottom-0 bg-[#121212] py-4">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-4 rounded-2xl font-bold text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black px-6 py-4 rounded-2xl font-bold transition-all shadow-lg shadow-emerald-500/20"
                  >
                    Salvar Ponto
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-[#121212] border border-white/10 w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-white/5 bg-white/5 flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold">Configurações</h2>
                  <p className="text-zinc-500 text-sm mt-1">Ajuste os parâmetros do seu banco de horas.</p>
                </div>
                <button 
                  onClick={syncHolidays}
                  className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl hover:bg-emerald-500/20 transition-all flex items-center gap-2 text-xs font-bold"
                >
                  <Calendar className="w-4 h-4" />
                  Sinc. Feriados
                </button>
              </div>
              
              <form onSubmit={handleSaveSettings} className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                    <History className="w-4 h-4" />
                    Saldo do Mês Anterior (Minutos)
                  </label>
                  <div className="flex gap-4 items-center">
                    <input 
                      type="number" 
                      value={previousBalance}
                      onChange={e => setPreviousBalance(parseInt(e.target.value || '0'))}
                      className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 focus:outline-none focus:border-emerald-500/50 transition-colors text-white font-mono"
                      placeholder="Ex: 120 para +2h ou -60 para -1h"
                    />
                    <div className="text-sm font-mono text-zinc-400 bg-white/5 px-4 py-3 rounded-2xl border border-white/10 min-w-[100px] text-center">
                      {minutesToTime(previousBalance)}h
                    </div>
                  </div>
                  <p className="text-[10px] text-zinc-500">
                    Insira o saldo positivo ou negativo em minutos. Esse valor será somado ao total acumulado.
                  </p>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsSettingsOpen(false)}
                    className="flex-1 px-6 py-4 rounded-2xl font-bold text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black px-6 py-4 rounded-2xl font-bold transition-all shadow-lg shadow-emerald-500/20"
                  >
                    Salvar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
