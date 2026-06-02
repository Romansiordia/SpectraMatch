import React, { useState, useRef } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Activity, Database, Upload, Microscope, Eraser, FileDown, CheckCircle2, XCircle } from 'lucide-react';

export default function App() {
  const [libraryData, setLibraryData] = useState<any>(null);
  const [sampleData, setSampleData] = useState<number[] | null>(null);
  const [uploadedSamples, setUploadedSamples] = useState<{id: string, spectrum: number[]}[] | null>(null);
  const [currentSampleIndex, setCurrentSampleIndex] = useState(0);
  const [currentSampleId, setCurrentSampleId] = useState<string | null>(null);
  const [matchScore, setMatchScore] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<{
    correlation: number;
    distance: number;
    confidence: number;
    isConforme: boolean;
    threshold: number;
  } | null>(null);
  const [batchResults, setBatchResults] = useState<{
    id: string;
    spectrum: number[];
    metrics: {
      correlation: number;
      distance: number;
      confidence: number;
      isConforme: boolean;
      threshold: number;
    }
  }[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sampleFileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        setLibraryData(json);
        setSampleData(null);
        setMetrics(null);
        setBatchResults(null);
      } catch (err) {
        alert("Invalid JSON file. Please check the format.");
      }
    };
    reader.readAsText(file);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSampleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.trim().split('\n');
        // skip header (lines[0])
        const samples = lines.slice(1).filter(line => line.trim() !== '').map(line => {
           const parts = line.split(',');
           const id = parts[0];
           const spectrum = parts.slice(1).map(Number);
           return { id, spectrum };
        });
        setUploadedSamples(samples);
        setCurrentSampleIndex(0);
        setCurrentSampleId(null);
        setSampleData(null);
        setMetrics(null);
        setBatchResults(null);
      } catch (err) {
        alert("Invalid CSV file.");
      }
    };
    reader.readAsText(file);
    if (sampleFileInputRef.current) {
        sampleFileInputRef.current.value = '';
    }
  };

  const getFirstDerivative = (data: number[]) => {
    const deriv = [];
    for (let i = 1; i < data.length - 1; i++) {
        deriv.push((data[i + 1] - data[i - 1]) / 2);
    }
    return deriv;
  };

  const getPearsonCorrelation = (x: number[], y: number[]) => {
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    const n = Math.min(x.length, y.length);
    for (let i = 0; i < n; i++) {
        sumX += x[i];
        sumY += y[i];
        sumXY += x[i] * y[i];
        sumX2 += x[i] * x[i];
        sumY2 += y[i] * y[i];
    }
    const numerator = (n * sumXY) - (sumX * sumY);
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    if (denominator === 0) return 0;
    return numerator / denominator;
  };

  const captureSample = () => {
    if (!libraryData?.referenceData?.meanSpectrum) return;
    
    const refSpectrum = libraryData.referenceData.meanSpectrum;
    const threshold = libraryData.referenceData?.threshold || 1.3323;
    let newSample: number[];

    if (uploadedSamples && uploadedSamples.length > 0) {
      const results = uploadedSamples.map(sample => {
        const iterSample = sample.spectrum;
        const correlation = getPearsonCorrelation(refSpectrum, iterSample);
        let sumSq = 0;
        for (let i = 0; i < Math.min(refSpectrum.length, iterSample.length); i++) {
            sumSq += Math.pow(refSpectrum[i] - iterSample[i], 2);
        }
        const distance = Math.sqrt(sumSq);
        
        let corrScore = Math.max(0, correlation) * 100;
        let distScore = Math.max(0, 100 * (1 - (distance / (threshold * 1.5)))); 
        let confidence = (0.6 * corrScore) + (0.4 * distScore);
        
        if (corrScore < 95) confidence /= 2;
        if (corrScore < 85) confidence = 0;
        
        const isConforme = (distance <= threshold) && (correlation >= 0.97);

        return {
          id: sample.id,
          spectrum: iterSample,
          metrics: { correlation, distance, confidence, isConforme, threshold }
        };
      });
      
      setBatchResults(results);
      setSampleData(results[0].spectrum);
      setMetrics(results[0].metrics);
      setCurrentSampleId(results[0].id);
    } else {
      const isMatch = Math.random() > 0.5;
      
      newSample = refSpectrum.map((val: number) => {
          if (isMatch) {
              return val * (0.95 + Math.random() * 0.1) + (Math.random() * 0.02 - 0.01);
          } else {
              return val * (0.3 + Math.random() * 0.4) + Math.random() * 0.1;
          }
      });

      if (!isMatch && Math.random() > 0.5) {
          newSample.reverse();
      }
      setCurrentSampleId(null);
      
      setSampleData(newSample);
      
      // Correlación de la forma (Pearson)
      const rawCorr = getPearsonCorrelation(refSpectrum, newSample);
      const correlation = rawCorr;
      
      // Distancia Euclidiana
      let sumSq = 0;
      for (let i = 0; i < Math.min(refSpectrum.length, newSample.length); i++) {
          sumSq += Math.pow(refSpectrum[i] - newSample[i], 2);
      }
      const distance = Math.sqrt(sumSq);
      
      // Selección y Penalización (Cálculo del %)
      let corrScore = Math.max(0, correlation) * 100;
      let distScore = Math.max(0, 100 * (1 - (distance / (threshold * 1.5)))); 
      
      let confidence = (0.6 * corrScore) + (0.4 * distScore);
      
      // Penalizaciones
      if (corrScore < 95) {
          confidence /= 2;
      }
      if (corrScore < 85) {
          confidence = 0;
      }
      
      // Veredicto Final (Conforme / No Conforme)
      const isConforme = (distance <= threshold) && (correlation >= 0.97);
      
      const newMetrics = {
          correlation: correlation,
          distance: distance,
          confidence: confidence,
          isConforme: isConforme,
          threshold: threshold
      };
      setMetrics(newMetrics);
      
      const newId = `SIM-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
      setCurrentSampleId(newId);
      
      const newResult = {
          id: newId,
          spectrum: newSample,
          metrics: newMetrics
      };
      
      setBatchResults(prev => prev ? [...prev, newResult] : [newResult]);
    }
  };

  const clearSample = () => {
    setSampleData(null);
    setMetrics(null);
    setCurrentSampleId(null);
    setBatchResults(null);
  };

  const generatePDFReport = () => {
    if (!batchResults || !libraryData) return;

    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.text("Reporte de Validación Espectral", 14, 22);
    
    doc.setFontSize(11);
    doc.text(`Propiedad Analítica: ${libraryData.analyticalProperty || 'N/A'}`, 14, 32);
    doc.text(`Fecha del Análisis: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 14, 38);
    doc.text(`Umbral Máximo de Aceptación: ${(libraryData.referenceData?.threshold || 1.3323).toFixed(4)}`, 14, 44);
    
    // Summary
    const total = batchResults.length;
    const ok = batchResults.filter(r => r.metrics.isConforme).length;
    doc.text(`Muestras Totales: ${total} | Conformes (Verdes): ${ok} | No Conformes (Rojas): ${total - ok}`, 14, 54);

    // Table
    const tableData = batchResults.map(r => [
      r.id,
      `${(Math.max(0, r.metrics.correlation) * 100).toFixed(2)}%`,
      r.metrics.distance.toFixed(4),
      `${r.metrics.confidence.toFixed(1)}%`,
      r.metrics.isConforme ? 'CONFORME (OK)' : 'NO CONFORME'
    ]);

    autoTable(doc, {
      startY: 60,
      head: [['ID Muestra', 'Corr. Pearson', 'Distancia Eucl.', 'Confiabilidad', 'Veredicto']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138] }, // text-blue-900 equivalent
      willDrawCell: function(data) {
        if (data.section === 'body' && data.column.index === 4) {
          if (data.cell.raw === 'CONFORME (OK)') {
            doc.setTextColor(22, 163, 74); // green-600
          } else {
            doc.setTextColor(220, 38, 38); // red-600
          }
        }
      }
    });

    doc.save(`Reporte_Espectral_${new Date().getTime()}.pdf`);
  };

  let refPath = null;
  let samplePath = null;
  let wlStart = "800 nm";
  let wlEnd = "2500 nm";

  if (libraryData?.referenceData?.meanSpectrum) {
      const refSpec = libraryData.referenceData.meanSpectrum;
      const wls = libraryData.referenceData.wavelengths || [];
      if (wls.length > 0) {
          wlStart = `${wls[0]} nm`;
          wlEnd = `${wls[wls.length - 1]} nm`;
      }
      
      const allVals = sampleData ? [...refSpec, ...sampleData] : refSpec;
      const dataMin = Math.min(...allVals);
      const dataMax = Math.max(...allVals);
      const range = (dataMax - dataMin) || 1;

      const getPathD = (spectrum: number[]) => {
          const points = spectrum.map((val, idx) => {
            const x = (idx / (spectrum.length - 1)) * 600;
            const y = 300 - ((val - dataMin) / range) * 300 * 0.8 - 30;
            return `${x},${y}`;
          });
          return `M${points.join(" L")}`;
      };

      refPath = <path d={getPathD(refSpec)} fill="none" stroke="#00A3FF" strokeWidth="2.5" />;
      if (sampleData) {
          samplePath = <path d={getPathD(sampleData)} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="4" />;
      }
  } else {
      refPath = <path d="M0,250 Q50,230 100,100 T200,180 T300,50 T400,200 T500,240 T600,260" fill="none" stroke="#00A3FF" strokeWidth="2.5" />;
      samplePath = sampleData ? null : <path d="M0,253 Q50,235 100,105 T200,185 T300,55 T400,205 T500,245 T600,265" fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="4" />;
  }

  return (
    <div className="flex h-screen w-full flex-col bg-[#0c2f55] font-sans text-slate-200 overflow-hidden">
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center justify-between bg-transparent px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-gradient-to-br from-cyan-400 to-blue-600 font-bold text-white shadow-[0_0_15px_rgba(34,211,238,0.4)]">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            Spectra<span className="text-cyan-400">Model</span>
          </h1>
        </div>
        <div className="h-8 w-8 rounded-full bg-[#101C2B] border border-[#1D3249] flex items-center justify-center cursor-pointer">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden p-6 gap-6 pt-0">
        {/* Sidebar */}
        <aside className="w-80 rounded-2xl border border-[#1D3249] bg-[#0B1A2E] p-6 flex flex-col shrink-0 overflow-y-auto no-scrollbar shadow-2xl">
          <div className="mb-8">
            <h2 className="flex items-center gap-2 text-xl font-bold text-white tracking-tight">
              <Database className="h-6 w-6 text-cyan-400" />
              Biblioteca
            </h2>
          </div>

          <div className="mt-2 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cargar Formato JSON</label>
              <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[#055b76] bg-[#072439] px-4 py-3 text-sm font-semibold text-cyan-400 hover:bg-[#0a2e47] transition-colors"
              >
                <Upload className="h-4 w-4" />
                Cargar Referencias
              </button>
            </div>
            
            <div className="flex flex-col gap-1.5 mt-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Archivos Lote CSV</label>
              <input type="file" accept=".csv" className="hidden" ref={sampleFileInputRef} onChange={handleSampleUpload} />
              <button 
                onClick={() => sampleFileInputRef.current?.click()}
                className="w-full flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[#055b76] bg-[#072439] px-4 py-3 text-sm font-semibold text-cyan-400 hover:bg-[#0a2e47] transition-colors"
              >
                <FileDown className="h-4 w-4" />
                Cargar Muestras (CSV)
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Registrados ({uploadedSamples ? uploadedSamples.length : 0})</label>
              <div className="rounded-lg border border-[#1D3249] bg-[#071321]/50 p-4 text-center min-h-[80px] flex flex-col items-center justify-center overflow-y-auto max-h-[160px] no-scrollbar">
                {uploadedSamples && uploadedSamples.length > 0 ? (
                  <div className="w-full space-y-2">
                    {uploadedSamples.map((s, idx) => (
                      <div key={idx} className="text-xs text-slate-300 font-mono text-left px-2 py-1 rounded bg-[#0a1b2d] border border-[#1a314d]">
                        {s.id}
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs italic text-slate-500">Sin datos</span>
                )}
              </div>
            </div>

            <button 
              onClick={clearSample}
              disabled={!sampleData}
              className={`w-full flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold transition-colors mt-2 ${sampleData ? 'border-rose-900/50 bg-rose-950/30 text-rose-400 hover:bg-rose-900/40 cursor-pointer' : 'border-[#1D3249] bg-[#071321]/50 text-slate-600 cursor-not-allowed'}`}
            >
              <Eraser className="h-4 w-4" />
              Limpiar
            </button>

            <button 
              onClick={captureSample}
              disabled={!libraryData}
              className={`w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-colors mt-4 ${libraryData ? 'bg-[#15344f] border border-[#1D3249] text-cyan-50 hover:bg-[#1a3f60] cursor-pointer shadow-lg' : 'bg-[#0b1622] text-slate-600 border border-[#1D3249] cursor-not-allowed'}`}
            >
              <Microscope className="h-4 w-4" />
              Analizar Muestra
            </button>

            <div className="border-t border-[#1D3249] mt-6 pt-6">
              <div className="rounded-xl border border-[#1D3249] bg-[#1a314d] p-4 flex flex-col gap-2 shadow-inner">
                <div className="flex items-center gap-2 text-cyan-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  <span className="font-bold text-sm">Metodología</span>
                </div>
                <p className="text-xs text-slate-300">Análisis de Distancia Euclidiana Multivariante. El umbral se define por 3 desviaciones estándar del grupo de referencia.</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 rounded-2xl border border-[#1D3249] bg-[#0B1A2E] flex flex-col p-8 overflow-y-auto no-scrollbar shadow-2xl relative">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
              </svg>
              <h2 className="text-2xl font-bold text-white tracking-tight">Terminal de Inspección</h2>
            </div>
            
            {libraryData && (
              <div className="flex items-center gap-4 bg-[#101c2c] px-5 py-2.5 rounded-lg border border-[#1D3249] shadow-lg">
                <span className="text-sm font-medium text-cyan-400"><span className="text-slate-500 mr-2">Target:</span> {libraryData.analyticalProperty || 'Unknown'}</span>
                <span className="text-sm font-medium text-slate-300 pl-4 border-l border-[#1D3249]">
                  <span className="text-slate-500 mr-2">Model:</span>{libraryData.modelType || 'Unknown'}
                </span>
                {currentSampleId && (
                  <span className="text-sm font-bold text-white pl-4 border-l border-[#1D3249]">
                    Sample #{currentSampleId}
                  </span>
                )}
              </div>
            )}
          </div>

          {!libraryData && !sampleData && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center mt-12 pointer-events-none">
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#142e47] border border-dashed border-[#1D3249] shadow-xl mb-6">
                <Activity className="h-10 w-10 text-cyan-400" />
              </div>
              <h3 className="text-2xl font-bold text-white tracking-tight mb-3">Listo para Inspección</h3>
              <p className="text-slate-400 max-w-sm text-sm leading-relaxed">
                Selecciona un archivo CSV con la muestra que deseas verificar contra tu biblioteca de referencia.
              </p>
            </div>
          )}

          <div className={`grid shrink-0 grid-cols-1 lg:grid-cols-3 gap-6 min-h-0 ${!libraryData && !sampleData ? 'opacity-0 invisible' : 'opacity-100 visible'}`}>
            {/* Spectrum Visualization */}
            <div className="col-span-1 lg:col-span-2 flex flex-col rounded-xl border border-[#1D3249] bg-[#101c2c] p-6 shadow-xl min-h-[400px]">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-tight text-white">Spectral Overlay</h3>
                <div className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded bg-[#00A3FF]"></div>
                    <span className="text-xs font-medium text-slate-300">Reference</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded border border-slate-400"></div>
                    <span className="text-xs font-medium text-slate-400">Captured</span>
                  </div>
                </div>
              </div>
              
              {/* Simulated Spectrum Graph */}
              <div className="relative flex-1 border-b border-l border-[#1D3249] min-h-0 mt-4 mb-4 ml-6">
                <svg viewBox="0 0 600 300" className="h-full w-full absolute inset-0" preserveAspectRatio="none">
                  {/* Grid lines */}
                  <line x1="0" y1="75" x2="600" y2="75" stroke="#1D3249" strokeWidth="1" strokeDasharray="4" />
                  <line x1="0" y1="150" x2="600" y2="150" stroke="#1D3249" strokeWidth="1" strokeDasharray="4" />
                  <line x1="0" y1="225" x2="600" y2="225" stroke="#1D3249" strokeWidth="1" strokeDasharray="4" />
                  {/* Paths */}
                  {refPath}
                  {samplePath}
                </svg>
                <div className="absolute -bottom-6 left-0 text-[10px] font-mono text-[#0bb4db]">{wlStart}</div>
                <div className="absolute -bottom-6 right-0 text-[10px] font-mono text-[#0bb4db]">{wlEnd}</div>
                <div className="absolute -left-10 top-0 bottom-0 flex items-center justify-center">
                  <span className="text-[10px] font-mono text-[#0bb4db] -rotate-90 whitespace-nowrap">Absorbance</span>
                </div>
              </div>
            </div>

            {/* Analysis Results Sidebar */}
            <div className="flex flex-col gap-6">
              {/* Match Score */}
              <div className={`rounded-xl border p-6 shadow-xl transition-colors ${
                  !metrics 
                    ? 'border-[#1D3249] bg-[#101c2c]' 
                    : metrics.isConforme 
                        ? 'border-emerald-500/30 bg-emerald-950/20' 
                        : 'border-rose-500/30 bg-rose-950/20'
              }`}>
                <p className={`text-xs font-bold uppercase tracking-wider ${
                    !metrics 
                      ? 'text-cyan-500' 
                      : metrics.isConforme ? 'text-emerald-400' : 'text-rose-400'
                }`}>Confiabilidad Global</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className={`text-5xl font-black ${
                    !metrics 
                      ? 'text-slate-500' 
                      : metrics.isConforme ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {metrics ? metrics.confidence.toFixed(1) : '--'}
                  </span>
                  <span className={`text-xl font-bold ${
                    !metrics 
                      ? 'text-slate-600' 
                      : metrics.isConforme ? 'text-emerald-500' : 'text-rose-500'
                  }`}>%</span>
                </div>
                <p className={`mt-2 text-sm font-bold ${
                    !metrics 
                      ? 'text-slate-500' 
                      : metrics.isConforme ? 'text-emerald-500' : 'text-rose-500'
                }`}>
                  {!metrics ? 'Esperando muestra...' : metrics.isConforme ? 'CONFORME (OK)' : 'NO CONFORME (FAIL)'}
                </p>
              </div>

              {/* Details List */}
              <div className="flex-1 rounded-xl border border-[#1D3249] bg-[#101c2c] p-6 shadow-xl flex flex-col">
                <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-cyan-500">Detalles de Evaluación</h3>
                <dl className="space-y-4 flex-1">
                  {metrics ? (
                      <>
                        <div>
                          <dt className="text-[10px] uppercase text-slate-400">Corr. de Forma (Pearson)</dt>
                          <dd className={`text-sm font-semibold mt-1 ${metrics.correlation >= 0.97 ? "text-emerald-400" : "text-rose-400"}`}>
                             {(Math.max(0, metrics.correlation) * 100).toFixed(2)}% {metrics.correlation >= 0.97 ? "✓" : "✗ (>97%)"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] uppercase text-slate-400">Distancia Euclidiana</dt>
                          <dd className={`text-sm font-semibold mt-1 ${metrics.distance <= metrics.threshold ? "text-emerald-400" : "text-rose-400"}`}>
                             {metrics.distance.toFixed(4)} {metrics.distance <= metrics.threshold ? "✓" : `✗ (Max ${metrics.threshold.toFixed(4)})`}
                          </dd>
                        </div>
                      </>
                  ) : (
                    <div>
                      <dt className="text-[10px] uppercase text-slate-400">Umbral Máximo Configurado</dt>
                      <dd className="text-sm font-semibold text-slate-300 mt-1">
                        {libraryData?.referenceData?.threshold ? libraryData.referenceData.threshold.toFixed(4) : '--'}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>
          </div>

          {batchResults && batchResults.length > 0 && (
            <div className="mt-8 flex flex-col rounded-xl border border-[#1D3249] bg-[#101c2c] shadow-xl overflow-hidden shrink-0 relative z-10">
              <div className="flex items-center justify-between border-b border-[#1D3249] bg-[#0b1421] px-6 py-4">
                <h3 className="text-sm font-bold uppercase tracking-tight text-white">Resultados del Lote ({batchResults.length} muestras)</h3>
                <button 
                  onClick={generatePDFReport}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-cyan-800 bg-[#122e4c] px-3 py-1.5 text-xs font-semibold text-cyan-400 hover:bg-[#1a3f68] transition-colors"
                >
                  <FileDown className="h-4 w-4" />
                  Descargar Reporte PDF
                </button>
              </div>
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="border-b border-[#1D3249] bg-[#071321] text-xs uppercase text-slate-400">
                    <tr>
                      <th className="px-6 py-3 font-semibold">ID Muestra</th>
                      <th className="px-6 py-3 font-semibold">Corr. de Forma</th>
                      <th className="px-6 py-3 font-semibold">Distancia</th>
                      <th className="px-6 py-3 font-semibold">Confianza</th>
                      <th className="px-6 py-3 font-semibold text-right">Veredicto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1D3249] bg-[#101c2c]">
                    {batchResults.map((result, idx) => (
                      <tr key={idx} className={`hover:bg-[#1a314d] cursor-pointer transition-colors ${currentSampleId === result.id ? 'bg-[#152a42]' : ''}`} onClick={() => {
                        setSampleData(result.spectrum);
                        setMetrics(result.metrics);
                        setCurrentSampleId(result.id);
                      }}>
                        <td className="px-6 py-4 font-medium text-white">{result.id}</td>
                        <td className={`px-6 py-4 font-semibold ${result.metrics.correlation >= 0.97 ? "text-emerald-400" : "text-rose-400"}`}>
                          {(Math.max(0, result.metrics.correlation) * 100).toFixed(2)}%
                        </td>
                        <td className={`px-6 py-4 font-semibold ${result.metrics.distance <= result.metrics.threshold ? "text-emerald-400" : "text-rose-400"}`}>
                          {result.metrics.distance.toFixed(4)}
                        </td>
                        <td className="px-6 py-4 font-semibold text-slate-200">
                          {result.metrics.confidence.toFixed(1)}%
                        </td>
                        <td className="px-6 py-4 text-right">
                           {result.metrics.isConforme ? (
                             <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/40 border border-emerald-800/50 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                               <CheckCircle2 className="h-3.5 w-3.5" /> OK
                             </span>
                           ) : (
                             <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-950/40 border border-rose-800/50 px-2.5 py-0.5 text-xs font-semibold text-rose-400">
                               <XCircle className="h-3.5 w-3.5" /> FAIL
                             </span>
                           )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
