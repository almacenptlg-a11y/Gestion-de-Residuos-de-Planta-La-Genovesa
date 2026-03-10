// ==========================================
// CONFIGURACIÓN DE GOOGLE APPS SCRIPT
// ==========================================
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxtRPvgzwS23dx5_NQLlsrIOgDjlP3-wX4B6li8wjJjjnmnnXi22b703PK8zFT4iplAKQ/exec';

// ==========================================
// VARIABLES GLOBALES
// ==========================================
let currentUser = null;
let chartAreaInstancia = null;
let chartTipoInstancia = null;
let datosCargados = false; 
let todosLosRegistros = []; 
let registrosFiltradosActuales = []; 

// ==========================================
// UTILIDADES DE EXTRACCIÓN Y FORMATO 
// ==========================================
function formatearFechaEstandar(fechaStr) {
  if (!fechaStr || fechaStr === '-') return '-';
  if (fechaStr.includes('T')) fechaStr = fechaStr.split('T')[0];
  const partes = fechaStr.split(/[-/]/);
  if (partes.length === 3) {
    if (partes[0].length === 4) return `${partes[2]}/${partes[1]}/${partes[0]}`;
    return `${partes[0].padStart(2, '0')}/${partes[1].padStart(2, '0')}/${partes[2]}`;
  }
  return fechaStr;
}

function formatearHora24(horaStr) {
  if (!horaStr || horaStr === '-') return '-';
  horaStr = String(horaStr).trim();
  const lowerHora = horaStr.toLowerCase();
  const isPM = lowerHora.includes('pm');
  const isAM = lowerHora.includes('am');
  
  let timeStr = lowerHora.replace(/[a-z]/ig, '').trim(); 
  let partes = timeStr.split(':');
  
  if (partes.length >= 2) {
    let h = parseInt(partes[0], 10);
    const m = partes[1].padStart(2, '0');
    const s = (partes[2] || '00').replace(/[^0-9]/g, '').padStart(2, '0');
    
    if (isNaN(h)) return horaStr;
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
    
    return `${String(h).padStart(2, '0')}:${m}:${s}`;
  }
  return horaStr;
}

function obtenerUrlImagen(reg) {
  if (!reg) return '';
  if (reg['IMAGEN']) return String(reg['IMAGEN']);
  if (reg['Imagen']) return String(reg['Imagen']);
  if (reg['imagen']) return String(reg['imagen']);
  
  for (const key in reg) {
    const kLower = key.toLowerCase();
    if (kLower.includes('imagen') || kLower.includes('foto') || kLower.includes('link') || kLower.includes('url')) {
       const val = reg[key];
       if (val && String(val).trim() !== '') {
           return String(val);
       }
    }
  }
  return '';
}

function obtenerObservaciones(reg) {
  if (!reg) return '';
  if (reg['OBSERVACIONES:'] !== undefined) return reg['OBSERVACIONES:'];
  if (reg['OBSERVACIONES'] !== undefined) return reg['OBSERVACIONES'];
  if (reg['observaciones:'] !== undefined) return reg['observaciones:'];
  if (reg['observaciones'] !== undefined) return reg['observaciones'];
  if (reg['Observaciones'] !== undefined) return reg['Observaciones'];

  for (const key in reg) {
    const kLower = key.toLowerCase();
    if (kLower.includes('observacion') || kLower.includes('detalle') || kLower.includes('comentario')) {
       return reg[key] || '';
    }
  }
  return '';
}

// ==========================================
// INICIALIZACIÓN
// ==========================================
function actualizarTimestamp() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  
  const hours24 = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  const timestampStr = `${day}/${month}/${year} ${hours24}:${minutes}:${seconds}`;
  document.getElementById('timestamp').value = timestampStr;
}

function inicializarFiltrosFechas() {
  const tzoffset = (new Date()).getTimezoneOffset() * 60000;
  const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().split('T')[0];
  
  document.getElementById('filtroFechaInicio').value = localISOTime;
  document.getElementById('filtroFechaFin').value = localISOTime;

  // REGLA ARQUITECTÓNICA: Prevenir el evento 'change' prematuro
  document.getElementById('filtroFechaInicio').addEventListener('blur', cargarDatosDashboard);
  document.getElementById('filtroFechaFin').addEventListener('blur', cargarDatosDashboard);
  
  document.getElementById('filtroFechaInicio').addEventListener('keydown', cargarDatosDashboard);
  document.getElementById('filtroFechaFin').addEventListener('keydown', cargarDatosDashboard);
  
  document.getElementById('filtroArea').addEventListener('change', aplicarFiltros);
  document.getElementById('filtroTipo').addEventListener('change', aplicarFiltros);
}

document.addEventListener('DOMContentLoaded', () => {
  const savedUser = localStorage.getItem('appResiduosUser');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    mostrarAplicacion();
  }
  actualizarTimestamp();
  inicializarFiltrosFechas();
});

// ==========================================
// NAVEGACIÓN (TABS)
// ==========================================
const tabs = {
  registro: { btn: document.getElementById('tabRegistro'), vista: document.getElementById('vistaRegistro') },
  revision: { btn: document.getElementById('tabRevision'), vista: document.getElementById('vistaRevision') },
  dashboard: { btn: document.getElementById('tabDashboard'), vista: document.getElementById('vistaDashboard') }
};

function cambiarVista(vistaActiva) {
  // Ocultar todas
  Object.values(tabs).forEach(tab => {
    tab.btn.classList.remove('text-green-600', 'border-b-2', 'border-green-600');
    tab.btn.classList.add('text-gray-500');
    tab.vista.classList.add('hidden');
  });

  // Mostrar la solicitada
  tabs[vistaActiva].btn.classList.add('text-green-600', 'border-b-2', 'border-green-600');
  tabs[vistaActiva].btn.classList.remove('text-gray-500');
  tabs[vistaActiva].vista.classList.remove('hidden');
}

tabs.registro.btn.addEventListener('click', () => cambiarVista('registro'));

tabs.revision.btn.addEventListener('click', async () => {
  cambiarVista('revision');
  if (!datosCargados) {
    await cargarDatosDashboard();
  } else {
    renderizarMisRegistros();
  }
});

tabs.dashboard.btn.addEventListener('click', () => {
  cambiarVista('dashboard');
  if (!datosCargados) cargarDatosDashboard();
});


// ==========================================
// MANEJO DEL LOGIN Y PERFIL
// ==========================================
const loginForm = document.getElementById('loginForm');
const loginSubmitBtn = document.getElementById('loginSubmitBtn');
const loginErrorMsg = document.getElementById('loginErrorMsg');
const loginErrorText = document.getElementById('loginErrorText');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginErrorMsg.classList.add('hidden');
  
  const userVal = document.getElementById('loginUsuario').value.trim();
  const passVal = document.getElementById('loginPassword').value.trim();
  const btnHtml = loginSubmitBtn.innerHTML;
  
  loginSubmitBtn.disabled = true;
  loginSubmitBtn.innerHTML = '<i class="ph ph-spinner ph-spin text-xl"></i> <span>Verificando...</span>';
  
  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'login', usuario: userVal, password: passVal })
    });

    const result = await response.json();

    if (result.status === 'success') {
      currentUser = result.user; 
      localStorage.setItem('appResiduosUser', JSON.stringify(currentUser));
      mostrarAplicacion();
    } else if (result.status === 'incomplete_profile') {
      currentUser = result.user; 
      document.getElementById('perfilNombre').value = currentUser.nombre || '';
      document.getElementById('perfilEmail').value = currentUser.email || '';
      document.getElementById('modalCompletarPerfil').classList.remove('hidden');
    } else {
      throw new Error(result.message || "Credenciales incorrectas");
    }

  } catch (error) {
    loginErrorText.textContent = error.message || "Error al conectar. Intenta nuevamente.";
    loginErrorMsg.classList.remove('hidden');
  } finally {
    loginSubmitBtn.disabled = false;
    loginSubmitBtn.innerHTML = btnHtml;
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('appResiduosUser');
  currentUser = null;
  datosCargados = false; 
  todosLosRegistros = [];
  registrosFiltradosActuales = [];
  document.getElementById('loginUsuario').value = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('appContainer').classList.add('hidden');
  document.getElementById('loginContainer').classList.remove('hidden');
  tabs.registro.btn.click(); 
});

function mostrarAplicacion() {
  document.getElementById('loginContainer').classList.add('hidden');
  document.getElementById('appContainer').classList.remove('hidden');
  document.getElementById('displayUserName').textContent = currentUser.nombre;
  document.getElementById('displayUserRole').textContent = currentUser.rol || "Supervisor";
}

// COMPLETAR PERFIL FALTANTE
const formCompletarPerfil = document.getElementById('formCompletarPerfil');
const btnGuardarPerfil = document.getElementById('btnGuardarPerfil');
const perfilErrorMsg = document.getElementById('perfilErrorMsg');

formCompletarPerfil.addEventListener('submit', async (e) => {
  e.preventDefault();
  perfilErrorMsg.classList.add('hidden');

  const nombreVal = document.getElementById('perfilNombre').value.trim();
  const emailVal = document.getElementById('perfilEmail').value.trim();

  const btnHtml = btnGuardarPerfil.innerHTML;
  btnGuardarPerfil.disabled = true;
  btnGuardarPerfil.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Guardando...';

  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'completarPerfil',
        usuario: currentUser.usuarioLogin, 
        nombre: nombreVal,
        email: emailVal
      })
    });

    const result = await response.json();

    if (result.status === 'success') {
      currentUser.nombre = nombreVal;
      currentUser.email = emailVal;
      localStorage.setItem('appResiduosUser', JSON.stringify(currentUser));
      document.getElementById('modalCompletarPerfil').classList.add('hidden');
      mostrarAplicacion();
    } else {
      throw new Error(result.message || "No se pudo actualizar el perfil.");
    }
  } catch (error) {
    perfilErrorMsg.textContent = error.message || "Error de conexión. Intenta nuevamente.";
    perfilErrorMsg.classList.remove('hidden');
  } finally {
    btnGuardarPerfil.disabled = false;
    btnGuardarPerfil.innerHTML = btnHtml;
  }
});

// ACTUALIZAR CREDENCIALES
const btnAbrirCredenciales = document.getElementById('btnAbrirCredenciales');
const modalCredenciales = document.getElementById('modalCredenciales');
const formCredenciales = document.getElementById('formCredenciales');
const btnGuardarCredenciales = document.getElementById('btnGuardarCredenciales');

btnAbrirCredenciales.addEventListener('click', () => {
  document.getElementById('credErrorMsg').classList.add('hidden');
  document.getElementById('credSuccessMsg').classList.add('hidden');
  document.getElementById('nuevoUsuario').value = currentUser.usuarioLogin || currentUser.nombre;
  document.getElementById('nuevaPassword').value = '';
  modalCredenciales.classList.remove('hidden');
});

document.getElementById('btnCerrarCredenciales').addEventListener('click', () => {
  modalCredenciales.classList.add('hidden');
});

formCredenciales.addEventListener('submit', async (e) => {
  e.preventDefault();
  document.getElementById('credErrorMsg').classList.add('hidden');
  document.getElementById('credSuccessMsg').classList.add('hidden');

  const nuevoUsuario = document.getElementById('nuevoUsuario').value.trim();
  const nuevaPassword = document.getElementById('nuevaPassword').value.trim();

  const btnHtml = btnGuardarCredenciales.innerHTML;
  btnGuardarCredenciales.disabled = true;
  btnGuardarCredenciales.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Guardando...';

  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ 
        action: 'actualizarCredenciales', 
        email: currentUser.email,
        nuevoUsuario: nuevoUsuario, 
        nuevaPassword: nuevaPassword 
      })
    });

    const result = await response.json();

    if (result.status === 'success') {
      currentUser.usuarioLogin = nuevoUsuario;
      localStorage.setItem('appResiduosUser', JSON.stringify(currentUser));
      
      document.getElementById('credSuccessMsg').classList.remove('hidden');
      setTimeout(() => { modalCredenciales.classList.add('hidden'); }, 2000);
    } else {
      throw new Error(result.message || "Error al actualizar credenciales");
    }
  } catch (error) {
    document.getElementById('credErrorMsg').textContent = error.message || "Error al conectar.";
    document.getElementById('credErrorMsg').classList.remove('hidden');
  } finally {
    btnGuardarCredenciales.disabled = false;
    btnGuardarCredenciales.innerHTML = btnHtml;
  }
});

// ==========================================
// LOGICA DEL DASHBOARD Y OBTENCIÓN DE DATOS
// ==========================================
async function cargarDatosDashboard(event) {
  if (event && event.type === 'keydown') {
    if (event.key !== 'Enter') return; 
    if (document.activeElement) document.activeElement.blur();
  }

  const fInicioStr = document.getElementById('filtroFechaInicio').value;
  const fFinStr = document.getElementById('filtroFechaFin').value;

  if (!fInicioStr || !fFinStr) return;

  const extraerAnio = (fecha) => {
    const match = fecha.match(/\d{4}/);
    return match ? parseInt(match[0], 10) : 0;
  };

  const yearInicio = extraerAnio(fInicioStr);
  const yearFin = extraerAnio(fFinStr);

  // Validación de seguridad para que el input date no dispare en fechas como '0002'
  if (yearInicio < 2000 || yearInicio > 2100) return; 
  if (yearFin < 2000 || yearFin > 2100) return; 

  const containerLoading = document.getElementById('dashboardLoading');
  const containerContent = document.getElementById('dashboardContent');

  containerContent.classList.add('hidden');
  containerLoading.classList.remove('hidden');

  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ 
        action: 'getDatos',
        fechaInicio: fInicioStr, 
        fechaFin: fFinStr        
      })
    });
    
    const result = await response.json();
    if (result.status === 'success') {
      todosLosRegistros = result.data; 
      datosCargados = true;
      aplicarFiltros(); 
      renderizarMisRegistros(); // Mantenemos la tabla de revisión sincronizada
    } else {
      throw new Error(result.message || "Error al obtener datos");
    }
  } catch (error) {
    console.error("Error Dashboard:", error);
    alert("No se pudieron cargar los datos del Dashboard.");
  } finally {
    containerLoading.classList.add('hidden');
    containerContent.classList.remove('hidden');
  }
}

function aplicarFiltros() {
  if (!datosCargados) return;

  const filtroArea = document.getElementById('filtroArea').value;
  const filtroTipo = document.getElementById('filtroTipo').value;

  const registrosFiltrados = todosLosRegistros.filter(reg => {
    const rArea = reg.area || reg.AREA;
    const rTipo = reg.tipo || reg.TIPO;
    
    if (filtroArea !== 'TODAS' && rArea !== filtroArea) return false;
    if (filtroTipo !== 'TODOS' && rTipo !== filtroTipo) return false;
    
    return true; 
  });

  registrosFiltradosActuales = registrosFiltrados; 
  procesarDatosParaGraficos(registrosFiltrados);
}

function procesarDatosParaGraficos(registros) {
  let totalPeso = 0;
  let totalBolsas = 0;
  let areasAgrupadas = {};
  let tiposAgrupados = {};

  registros.forEach(reg => {
    const rPeso = Number(reg.peso || reg.PESO) || 0;
    const rBolsas = Number(reg.bolsas || reg['BOLSAS USADAS'] || reg.BOLSAS_USADAS) || 0;
    const rArea = reg.area || reg.AREA;
    const rTipo = reg.tipo || reg.TIPO;
    
    totalPeso += rPeso;
    totalBolsas += rBolsas;

    if (areasAgrupadas[rArea]) areasAgrupadas[rArea] += rPeso;
    else areasAgrupadas[rArea] = rPeso;

    if (tiposAgrupados[rTipo]) tiposAgrupados[rTipo] += rPeso;
    else tiposAgrupados[rTipo] = rPeso;
  });

  const areasKeys = Object.keys(areasAgrupadas).filter(k => areasAgrupadas[k] > 0).sort((a,b) => areasAgrupadas[b] - areasAgrupadas[a]);
  const areasValues = areasKeys.map(k => areasAgrupadas[k].toFixed(2));
  const areasLabelsMulti = areasKeys.map((k, i) => [k, `${areasValues[i]} kg`]);

  const tiposKeys = Object.keys(tiposAgrupados).filter(k => tiposAgrupados[k] > 0);
  const tiposValues = tiposKeys.map(k => tiposAgrupados[k].toFixed(2));
  const tiposLabelsMulti = tiposKeys.map((k, i) => `${k}: ${tiposValues[i]} kg`);

  document.getElementById('kpiPeso').textContent = totalPeso.toFixed(2) + ' kg';
  document.getElementById('kpiBolsas').textContent = totalBolsas;
  document.getElementById('kpiRegistros').textContent = registros.length;

  dibujarGraficoAreas(areasLabelsMulti, areasValues);
  dibujarGraficoTipos(tiposLabelsMulti, tiposValues);
}

Chart.defaults.font.family = 'sans-serif';

function dibujarGraficoAreas(labels, data) {
  const ctx = document.getElementById('chartArea').getContext('2d');
  if (chartAreaInstancia) chartAreaInstancia.destroy();

  chartAreaInstancia = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Kg de Residuos',
        data: data,
        backgroundColor: 'rgba(34, 197, 94, 0.8)',
        borderColor: 'rgb(22, 163, 74)',
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { 
        y: { beginAtZero: true },
        x: { ticks: { font: { weight: '600' } } }
      },
      animation: false
    }
  });
}

function dibujarGraficoTipos(labels, data) {
  const ctx = document.getElementById('chartTipo').getContext('2d');
  if (chartTipoInstancia) chartTipoInstancia.destroy();

  const coloresTipos = labels.map(tipo => {
    if(tipo.includes('Organico') || tipo.includes('ORGANICO')) return '#22c55e'; 
    if(tipo.includes('Plastico') || tipo.includes('PLASTICO')) return '#3b82f6'; 
    if(tipo.includes('Carton') || tipo.includes('CARTON')) return '#eab308'; 
    return '#6b7280'; 
  });

  chartTipoInstancia = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: coloresTipos,
        borderWidth: 2,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      animation: false
    }
  });
}

// ==========================================
// EXPORTAR E IMPRIMIR REPORTE
// ==========================================
document.getElementById('btnExportarExcel').addEventListener('click', () => {
  if (registrosFiltradosActuales.length === 0) {
    alert("No hay registros para exportar con los filtros actuales.");
    return;
  }

  const datosExcel = registrosFiltradosActuales.map(reg => {
    return {
      'Fecha': formatearFechaEstandar(reg.fecha || reg.FECHA),
      'Hora': formatearHora24(reg.hora || reg.HORA),
      'Supervisor': reg.supervisor || reg.SUPERVISOR || '-',
      'Área': reg.area || reg.AREA || '-',
      'Tipo de Residuo': reg.tipo || reg.TIPO || '-',
      'Peso (Kg)': reg.peso || reg.PESO || 0,
      'Bolsas Utilizadas': reg.bolsas || reg['BOLSAS USADAS'] || reg.BOLSAS_USADAS || 0,
      'Observaciones': obtenerObservaciones(reg) || '',
      'Imagen (Link)': obtenerUrlImagen(reg) || 'Sin Imagen'
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(datosExcel);
  const workbook = XLSX.utils.book_new();

  worksheet['!cols'] = [
    {wch: 12}, {wch: 10}, {wch: 30}, {wch: 20}, {wch: 20},
    {wch: 12}, {wch: 15}, {wch: 40}, {wch: 50}
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, "Residuos");
  XLSX.writeFile(workbook, `Reporte_Residuos_${new Date().toISOString().split('T')[0]}.xlsx`);
});

document.getElementById('btnPrint').addEventListener('click', () => {
  const selArea = document.getElementById('filtroArea');
  const selTipo = document.getElementById('filtroTipo');

  document.getElementById('printFInicio').textContent = document.getElementById('filtroFechaInicio').value;
  document.getElementById('printFFin').textContent = document.getElementById('filtroFechaFin').value;
  document.getElementById('printFArea').textContent = selArea.options[selArea.selectedIndex].text;
  document.getElementById('printFTipo').textContent = selTipo.options[selTipo.selectedIndex].text;
  document.getElementById('printFirmaNombre').textContent = currentUser.nombre;

  window.print();
});

// ==========================================
// LÓGICA DE LA VISTA: MIS REGISTROS (EDICIÓN)
// ==========================================
function renderizarMisRegistros() {
  const tbody = document.getElementById('tablaMisRegistros');
  const emptyState = document.getElementById('emptyRevisionState');
  if (!tbody || !emptyState) return;
  tbody.innerHTML = '';
  
  // Filtramos por correo (o nombre) del usuario autenticado actual
  const misRegistros = todosLosRegistros.filter(r => {
    const autorEmail = String(r.email || r.supervisor).trim().toLowerCase();
    const sesionEmail = String(currentUser.email).trim().toLowerCase();
    const sesionNombre = String(currentUser.nombre).trim().toLowerCase();
    return autorEmail === sesionEmail || autorEmail === sesionNombre;
  });
  
  if (misRegistros.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  
  emptyState.classList.add('hidden');
  
  // Ordenar de más reciente a más antiguo basándose en el ID (Timestamp)
  misRegistros.sort((a, b) => Number(b.id) - Number(a.id));
  
  misRegistros.forEach(reg => {
    let colorTipo = "bg-gray-100 text-gray-800";
    const tipo = String(reg.tipo || reg.TIPO || '');
    if(tipo.includes("Organico")) colorTipo = "bg-green-100 text-green-800";
    else if(tipo.includes("Plastico")) colorTipo = "bg-blue-100 text-blue-800";
    else if(tipo.includes("Carton")) colorTipo = "bg-yellow-100 text-yellow-800";
    
    const tr = document.createElement('tr');
    tr.className = "hover:bg-gray-50 transition-colors";
    tr.innerHTML = `
      <td class="px-4 py-3 whitespace-nowrap">
        <div class="font-medium text-gray-900">${formatearFechaEstandar(reg.fecha || reg.FECHA)}</div>
        <div class="text-xs text-gray-500">${formatearHora24(reg.hora || reg.HORA)}</div>
      </td>
      <td class="px-4 py-3 whitespace-nowrap">${reg.area || reg.AREA}</td>
      <td class="px-4 py-3 whitespace-nowrap">
        <span class="px-2 py-1 text-[10px] rounded-full font-medium ${colorTipo}">${tipo}</span>
      </td>
      <td class="px-4 py-3 whitespace-nowrap text-center font-medium">${reg.peso || reg.PESO}</td>
      <td class="px-4 py-3 whitespace-nowrap text-center text-gray-500">${reg.bolsas || reg.BOLSAS_USADAS || reg['BOLSAS USADAS'] || 0}</td>
      <td class="px-4 py-3 whitespace-nowrap text-center">
        <button onclick="abrirModalEdicion('${reg.id}')" class="text-green-600 hover:text-green-800 hover:bg-green-50 p-2 rounded-full transition-colors" title="Editar">
          <i class="ph ph-pencil-simple text-lg"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Controladores del Modal de Edición (Debe ser global para el onclick HTML)
window.abrirModalEdicion = function(id) {
  const registro = todosLosRegistros.find(r => String(r.id) === String(id));
  if (!registro) return;
  
  document.getElementById('editId').value = registro.id;
  document.getElementById('editArea').value = registro.area || registro.AREA;
  document.getElementById('editTipo').value = registro.tipo || registro.TIPO;
  document.getElementById('editPeso').value = registro.peso || registro.PESO || 0;
  document.getElementById('editBolsas').value = registro.bolsas || registro.BOLSAS_USADAS || registro['BOLSAS USADAS'] || 1;
  document.getElementById('editObservaciones').value = obtenerObservaciones(registro);
  
  document.getElementById('modalEdicion').classList.remove('hidden');
};

window.cerrarModalEdicion = function() {
  document.getElementById('modalEdicion').classList.add('hidden');
};

document.getElementById('formEdicionRegistro').addEventListener('submit', async function(e) {
  e.preventDefault();
  
  const btnGuardar = document.getElementById('btnGuardarEdicion');
  const originalText = btnGuardar.innerHTML;
  btnGuardar.disabled = true;
  btnGuardar.innerHTML = '<i class="ph ph-spinner ph-spin text-xl"></i> Guardando...';
  
  const payload = {
    action: 'editarRegistro',
    id: document.getElementById('editId').value,
    supervisorEmail: currentUser.email, 
    area: document.getElementById('editArea').value,
    tipo: document.getElementById('editTipo').value,
    peso: parseFloat(document.getElementById('editPeso').value),
    bolsas: parseInt(document.getElementById('editBolsas').value),
    observaciones: document.getElementById('editObservaciones').value
  };

  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    
    if (result.success || result.status === 'success') {
      // Regla Arquitectónica: Single Page Application Update (No recargamos la BD)
      const index = todosLosRegistros.findIndex(r => String(r.id) === String(payload.id));
      if (index !== -1) {
        todosLosRegistros[index] = { ...todosLosRegistros[index], ...payload };
      }
      
      renderizarMisRegistros();
      aplicarFiltros(); // Actualizamos KPIs y Gráficos del dashboard en silencio
      cerrarModalEdicion();
    } else {
      alert("Error: " + result.message);
    }
  } catch (error) {
    console.error("Error actualizando registro:", error);
    alert("Ocurrió un error de conexión al actualizar.");
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.innerHTML = originalText;
  }
});


// ==========================================
// FORMULARIO DE REGISTRO (CREACIÓN)
// ==========================================
const imagenInput = document.getElementById('imagen');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const imagePlaceholder = document.getElementById('imagePlaceholder');
const imagePreviewContainer = document.getElementById('imagePreviewContainer');
const imagePreview = document.getElementById('imagePreview');
const removeImageBtn = document.getElementById('removeImageBtn');

let imageBase64 = '';
let imageMimeType = '';
let imageName = '';

imagenInput.addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (file) {
    fileNameDisplay.textContent = file.name;
    imageName = file.name;
    imageMimeType = file.type;
    const reader = new FileReader();
    reader.onload = function(readerEvent) {
      const dataUrl = readerEvent.target.result;
      imagePreview.src = dataUrl;
      imagePlaceholder.classList.add('hidden');
      imagePreviewContainer.classList.remove('hidden');
      imagePreviewContainer.classList.add('flex');
      imageBase64 = dataUrl.split(',')[1];
    }
    reader.readAsDataURL(file);
  } else {
    resetImageUI();
  }
});

removeImageBtn.addEventListener('click', () => resetImageUI());

function resetImageUI() {
  imagenInput.value = '';
  imagePreview.src = '';
  imagePlaceholder.classList.remove('hidden');
  imagePreviewContainer.classList.add('hidden');
  imagePreviewContainer.classList.remove('flex');
  imageBase64 = '';
  imageMimeType = '';
  imageName = '';
  document.getElementById('observaciones').value = '';
}

const form = document.getElementById('residuosForm');
const submitBtn = document.getElementById('submitBtn');
const successMessage = document.getElementById('successMessage');
const registrosContainer = document.getElementById('registrosContainer');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const btnOriginalHtml = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="ph ph-spinner ph-spin text-xl"></i> <span>Guardando...</span>';
  
  const timestampVal = document.getElementById('timestamp').value.trim();
  const parts = timestampVal.split(' ');
  const fechaVal = parts[0] || '';
  const horaVal = parts[1] || '';
  
  const formData = {
    action: 'registrar',
    supervisor: currentUser.email, // Trazabilidad Inmutable
    area: document.getElementById('area').value,
    tipo: document.getElementById('tipo').value,
    peso: document.getElementById('peso').value,
    bolsas: document.getElementById('bolsas').value,
    fecha: fechaVal,
    hora: horaVal,
    observaciones: document.getElementById('observaciones').value,
    imagenBase64: imageBase64,
    imagenMimeType: imageMimeType,
    imagenNombre: imageName
  };

  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(formData)
    });
    
    const result = await response.json();
    if (result.status !== 'success') {
      throw new Error(result.message || "Error desconocido al guardar en servidor");
    }

    agregarRegistroAUi(formData);
    successMessage.classList.remove('opacity-0');
    setTimeout(() => successMessage.classList.add('opacity-0'), 3000);
    
    document.getElementById('peso').value = '';
    document.getElementById('bolsas').value = '1';
    resetImageUI();
    actualizarTimestamp();
    
    datosCargados = false; // Invalidamos la caché local para forzar recarga en el dashboard
    
  } catch (error) {
    console.error("Error al guardar:", error);
    alert("Hubo un error al guardar el registro. Intente nuevamente.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = btnOriginalHtml;
  }
});

function agregarRegistroAUi(data) {
  if (registrosContainer.querySelector('.italic')) {
    registrosContainer.innerHTML = '';
  }
  const colorTipo = data.tipo === 'Organico' ? 'bg-green-100 text-green-700' :
    data.tipo === 'Plastico' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-700';
  
  const supervisorCorto = data.supervisor.split('@')[0];
  const idSimulado = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  const fotoIcon = data.imagenBase64 ? '<i class="ph-fill ph-image text-green-500" title="Foto adjunta"></i>' : '';
  const fechaMostrar = formatearFechaEstandar(data.fecha);
  const horaMostrar = formatearHora24(data.hora);

  const html = `
      <div class="p-4 rounded-lg border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors fade-in">
          <div class="flex justify-between items-start mb-2">
              <span class="text-xs font-mono text-gray-500">#${idSimulado} ${fotoIcon}</span>
              <span class="text-xs px-2 py-1 rounded-full font-medium ${colorTipo}">${data.tipo}</span>
          </div>
          <p class="font-medium text-gray-900">${data.area}</p>
          <div class="mt-2 text-sm text-gray-600 flex justify-between">
              <span>${data.peso} kg</span>
              <span>${data.bolsas} bolsa(s)</span>
          </div>
          <div class="mt-2 text-xs text-gray-500 flex justify-between items-center border-t border-gray-200 pt-2">
              <span class="truncate max-w-[120px]" title="${data.supervisor}">${supervisorCorto}</span>
              <span>${fechaMostrar} ${horaMostrar}</span>
          </div>
      </div>
  `;
  registrosContainer.insertAdjacentHTML('afterbegin', html);
}
