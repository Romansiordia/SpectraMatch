import React, { useState, useRef } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Activity, Upload, Microscope, Eraser, FileDown, CheckCircle2, XCircle } from 'lucide-react';

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
      
      setMetrics({
          correlation: correlation,
          distance: distance,
          confidence: confidence,
          isConforme: isConforme,
          threshold: threshold
      });
      setBatchResults(null);
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

      refPath = <path d={getPathD(refSpec)} fill="none" stroke="#2563eb" strokeWidth="2.5" />;
      if (sampleData) {
          samplePath = <path d={getPathD(sampleData)} fill="none" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="4" />;
      }
  } else {
      refPath = <path d="M0,250 Q50,230 100,100 T200,180 T300,50 T400,200 T500,240 T600,260" fill="none" stroke="#2563eb" strokeWidth="2.5" />;
      samplePath = sampleData ? null : <path d="M0,253 Q50,235 100,105 T200,185 T300,55 T400,205 T500,245 T600,265" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="4" />;
  }

  return (
    <div className="flex h-screen w-full flex-col bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-blue-700 font-bold text-white">S</div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-800">
            Spectra<span className="text-blue-600">Match</span>
          </h1>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r border-slate-200 bg-slate-50 p-6 flex flex-col shrink-0 overflow-y-auto">
          <nav className="space-y-1">
            <a href="#" className="flex items-center gap-3 rounded-md bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">
              <Activity className="h-5 w-5" />
              Live Analysis
            </a>
          </nav>


          <div className="mt-10 flex flex-col gap-3">
            <h3 className="px-3 mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Actions</h3>
            <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Upload className="h-4 w-4" />
              Load Library JSON
            </button>
            
            <input type="file" accept=".csv" className="hidden" ref={sampleFileInputRef} onChange={handleSampleUpload} />
            <button 
              onClick={() => sampleFileInputRef.current?.click()}
              className="w-full flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Upload className="h-4 w-4" />
              Load Samples CSV
            </button>

            <button 
              onClick={clearSample}
              disabled={!sampleData}
              className={`w-full flex items-center gap-3 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${sampleData ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer' : 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed'}`}
            >
              <Eraser className="h-4 w-4" />
              Limpiar
            </button>

            <button 
              onClick={captureSample}
              disabled={!libraryData}
              className={`w-full flex items-center gap-3 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors mt-2 ${libraryData ? 'bg-blue-600 hover:bg-blue-700 cursor-pointer' : 'bg-slate-400 cursor-not-allowed'}`}
            >
              <Microscope className="h-4 w-4" />
              Analizar Muestra
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col p-8 overflow-y-auto bg-slate-50">
          <div className="flex items-end justify-between mb-6">
            <div>
              <p className="text-sm font-medium text-blue-600">
                {currentSampleId 
                  ? `Sample Analysis #${currentSampleId}`
                  : libraryData ? `Model: ${libraryData.modelType || 'Unknown'} | Components: ${libraryData.nComponents || 0}` : 'Awaiting Library...'}
              </p>
              <h2 className="text-2xl font-bold text-slate-800">
                {libraryData ? `Target: ${libraryData.analyticalProperty || 'Unknown'}` : 'Select a Database to Begin'}
              </h2>
            </div>
          </div>

          <div className="grid shrink-0 grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
            {/* Spectrum Visualization */}
            <div className="col-span-1 lg:col-span-2 flex flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm min-h-[400px]">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-tight text-slate-400">Spectral Overlay</h3>
                <div className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-sm bg-blue-600"></div>
                    <span className="text-xs font-medium">Reference</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-sm border-2 border-slate-300"></div>
                    <span className="text-xs font-medium text-slate-400">Captured</span>
                  </div>
                </div>
              </div>
              
              {/* Simulated Spectrum Graph */}
              <div className="relative flex-1 border-b border-l border-slate-100 min-h-0 mt-4 mb-4 ml-6">
                <svg viewBox="0 0 600 300" className="h-full w-full absolute inset-0" preserveAspectRatio="none">
                  {/* Grid lines */}
                  <line x1="0" y1="75" x2="600" y2="75" stroke="#f1f5f9" strokeWidth="1" />
                  <line x1="0" y1="150" x2="600" y2="150" stroke="#f1f5f9" strokeWidth="1" />
                  <line x1="0" y1="225" x2="600" y2="225" stroke="#f1f5f9" strokeWidth="1" />
                  {/* Paths */}
                  {refPath}
                  {samplePath}
                </svg>
                <div className="absolute -bottom-6 left-0 text-[10px] text-slate-400">{wlStart}</div>
                <div className="absolute -bottom-6 right-0 text-[10px] text-slate-400">{wlEnd}</div>
                <div className="absolute -left-10 top-0 bottom-0 flex items-center justify-center">
                  <span className="text-[10px] text-slate-400 -rotate-90 whitespace-nowrap">Absorbance</span>
                </div>
              </div>
            </div>

            {/* Analysis Results Sidebar */}
            <div className="flex flex-col gap-6">
              {/* Match Score */}
              <div className={`rounded-xl border p-6 shadow-sm transition-colors ${
                  !metrics 
                    ? 'border-slate-200 bg-white' 
                    : metrics.isConforme 
                        ? 'border-green-200 bg-green-50' 
                        : 'border-red-200 bg-red-50'
              }`}>
                <p className={`text-xs font-bold uppercase tracking-wider ${
                    !metrics 
                      ? 'text-slate-500' 
                      : metrics.isConforme ? 'text-green-700' : 'text-red-700'
                }`}>Confiabilidad Global</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className={`text-5xl font-black ${
                    !metrics 
                      ? 'text-slate-300' 
                      : metrics.isConforme ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {metrics ? metrics.confidence.toFixed(1) : '--'}
                  </span>
                  <span className={`text-xl font-bold ${
                    !metrics 
                      ? 'text-slate-300' 
                      : metrics.isConforme ? 'text-green-600' : 'text-red-600'
                  }`}>%</span>
                </div>
                <p className={`mt-2 text-sm font-bold ${
                    !metrics 
                      ? 'text-slate-400' 
                      : metrics.isConforme ? 'text-green-800' : 'text-red-800'
                }`}>
                  {!metrics ? 'Esperando muestra...' : metrics.isConforme ? 'CONFORME (OK)' : 'NO CONFORME (FAIL)'}
                </p>
              </div>

              {/* Details List */}
              <div className="flex-1 rounded-xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col">
                <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-400">Detalles de Evaluación</h3>
                <dl className="space-y-4 flex-1">
                  {metrics ? (
                      <>
                        <div>
                          <dt className="text-[10px] uppercase text-slate-400">Corr. de Forma (Pearson)</dt>
                          <dd className={`text-sm font-semibold ${metrics.correlation >= 0.97 ? "text-green-600" : "text-red-600"}`}>
                             {(Math.max(0, metrics.correlation) * 100).toFixed(2)}% {metrics.correlation >= 0.97 ? "✓" : "✗ (>97%)"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] uppercase text-slate-400">Distancia Euclidiana</dt>
                          <dd className={`text-sm font-semibold ${metrics.distance <= metrics.threshold ? "text-green-600" : "text-red-600"}`}>
                             {metrics.distance.toFixed(4)} {metrics.distance <= metrics.threshold ? "✓" : `✗ (Max ${metrics.threshold.toFixed(4)})`}
                          </dd>
                        </div>
                      </>
                  ) : (
                    <div>
                      <dt className="text-[10px] uppercase text-slate-400">Umbral Máximo Configurado</dt>
                      <dd className="text-sm font-semibold text-slate-800">
                        {libraryData?.referenceData?.threshold ? libraryData.referenceData.threshold.toFixed(4) : '--'}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>
          </div>

          {batchResults && batchResults.length > 0 && (
            <div className="mt-8 flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden shrink-0">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
                <h3 className="text-sm font-bold uppercase tracking-tight text-slate-800">Resultados del Lote ({batchResults.length} muestras)</h3>
                <button 
                  onClick={generatePDFReport}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                >
                  <FileDown className="h-4 w-4" />
                  Descargar Reporte PDF
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-6 py-3 font-semibold">ID Muestra</th>
                      <th className="px-6 py-3 font-semibold">Corr. de Forma</th>
                      <th className="px-6 py-3 font-semibold">Distancia</th>
                      <th className="px-6 py-3 font-semibold">Confianza</th>
                      <th className="px-6 py-3 font-semibold text-right">Veredicto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {batchResults.map((result, idx) => (
                      <tr key={idx} className={`hover:bg-slate-50 cursor-pointer ${currentSampleId === result.id ? 'bg-blue-50/50' : ''}`} onClick={() => {
                        setSampleData(result.spectrum);
                        setMetrics(result.metrics);
                        setCurrentSampleId(result.id);
                      }}>
                        <td className="px-6 py-4 font-medium text-slate-900">{result.id}</td>
                        <td className={`px-6 py-4 font-semibold ${result.metrics.correlation >= 0.97 ? "text-green-600" : "text-red-600"}`}>
                          {(Math.max(0, result.metrics.correlation) * 100).toFixed(2)}%
                        </td>
                        <td className={`px-6 py-4 font-semibold ${result.metrics.distance <= result.metrics.threshold ? "text-green-600" : "text-red-600"}`}>
                          {result.metrics.distance.toFixed(4)}
                        </td>
                        <td className="px-6 py-4 font-semibold">
                          {result.metrics.confidence.toFixed(1)}%
                        </td>
                        <td className="px-6 py-4 text-right">
                           {result.metrics.isConforme ? (
                             <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                               <CheckCircle2 className="h-3.5 w-3.5" /> OK
                             </span>
                           ) : (
                             <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
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
