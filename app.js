function formatInputVNNumber(e) {
  let input = e.target;
  let val = input.value;
  val = val.replace(/[^0-9,]/g, '');
  const commaIndex = val.indexOf(',');
  if (commaIndex !== -1) {
    val = val.substring(0, commaIndex + 1) + val.substring(commaIndex + 1).replace(/,/g, '');
  }
  if (val) {
    const parts = val.split(',');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    input.value = parts.join(',');
  } else {
    input.value = '';
  }
}

document.addEventListener('input', function(e) {
  if (e.target && e.target.classList.contains('format-number')) {
    formatInputVNNumber(e);
  }
});

// --- NUMBER FORMATTING INJECTED ---
function parseVNNumber(val) {
  if (val === null || val === undefined || val === '') return '';
  if (typeof val === 'number') return val;
  val = val.toString().replace(/\./g, '').replace(',', '.');
  const num = parseFloat(val);
  return isNaN(num) ? '' : num;
}

function formatVNNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return '';
  let parts = num.toString().split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return parts.join(',');
}

function setupNumberFormatting() {
  document.querySelectorAll('.format-number').forEach(input => {
    input.addEventListener('input', function(e) {
      let val = this.value;
      val = val.replace(/[^0-9,]/g, '');
      let parts = val.split(',');
      if (parts.length > 2) parts = [parts[0], parts.slice(1).join('')];
      if (parts[0]) {
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      }
      this.value = parts.join(',');
    });
  });
}
// ----------------------------------

/**
 * app.js - Logic điều khiển giao diện Single Page Application (SPA) nâng cấp v1.1.0.
 * Hỗ trợ Dashboard tổng hợp tất cả dự án, Matrix TMĐT đa giai đoạn,
 * lồng tiến độ chi tiết gói thầu vào tab quản lý dự án.
 */


// Escape HTML để chống vỡ giao diện / injection khi hiển thị văn bản người dùng nhập
function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// --- STATE MANAGEMENT ---
const state = {
  currentProjectId: 'all', // Mặc định hiển thị tất cả dự án khi khởi động
  activeTab: 'dashboard',
  activeContractId: null, // Hợp đồng đang chọn trong tab thanh toán
  charts: {
    dashboardBar: null,
    dashboardDoughnut: null,
    tmdtDoughnut: null,
    allProjectsBar: null
  }
};
// Cho phép module đồng bộ đám mây (cloud-sync.js) đọc/cập nhật trạng thái
window.state = state;

// --- HELPER FUNCTIONS ---
function formatVND(value) {
  if (value === undefined || value === null || isNaN(value)) return '0 ₫';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
}

window.selectProject = function(projectId) {
  state.currentProjectId = projectId;
  localStorage.setItem('antigravity_current_project_id', projectId);
  document.getElementById('global-project-select').value = projectId;
  state.activeContractId = null;
  renderActiveTab();
  // Optionally, switch to dashboard tab
  switchTab('dashboard');
};

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatCurrency(value) {
  return formatVNNumber(value);
}

function getCategoryName(cat) {
  const cats = {
    gpmb: 'Bồi thường, hỗ trợ & GPMB',
    construction: 'Chi phí Xây dựng',
    equipment: 'Chi phí Thiết bị',
    qlda: 'Chi phí Quản lý dự án',
    consulting: 'Chi phí Tư vấn xây dựng',
    other: 'Chi phí Khác',
    contingency: 'Chi phí Dự phòng'
  };
  return cats[cat] || cat;
}

function getStatusBadge(type, status) {
  let text = status;
  let cssClass = 'badge-primary';

  if (type === 'project') {
    if (status === 'planned') { text = 'Chuẩn bị'; cssClass = 'badge-info'; }
    else if (status === 'in-progress') { text = 'Đang thi công'; cssClass = 'badge-warning'; }
    else if (status === 'completed') { text = 'Đã bàn giao'; cssClass = 'badge-success'; }
  } 
  else if (type === 'bid') {
    if (status === 'planned') { text = 'Kế hoạch'; cssClass = 'badge-primary'; }
    else if (status === 'bidding') { text = 'Đang đấu thầu'; cssClass = 'badge-info'; }
    else if (status === 'evaluated') { text = 'Đang chấm thầu'; cssClass = 'badge-warning'; }
    else if (status === 'awarded') { text = 'Đã trúng thầu'; cssClass = 'badge-success'; }
    else if (status === 'cancelled') { text = 'Hủy thầu'; cssClass = 'badge-danger'; }
  }
  else if (type === 'contract') {
    if (status === 'draft') { text = 'Soạn thảo'; cssClass = 'badge-primary'; }
    else if (status === 'active') { text = 'Đang thực hiện'; cssClass = 'badge-success'; }
    else if (status === 'liquidated') { text = 'Đã thanh lý'; cssClass = 'badge-info'; }
  }
  else if (type === 'payment') {
    if (status === 'pending') { text = 'Chờ duyệt'; cssClass = 'badge-warning'; }
    else if (status === 'approved') { text = 'Đã duyệt chi'; cssClass = 'badge-info'; }
    else if (status === 'paid') { text = 'Đã giải ngân'; cssClass = 'badge-success'; }
  }
  else if (type === 'milestone') {
    if (status === 'pending') { text = 'Chưa bắt đầu'; cssClass = 'badge-primary'; }
    else if (status === 'on-track') { text = 'Đúng tiến độ'; cssClass = 'badge-success'; }
    else if (status === 'delayed') { text = 'Trễ tiến độ'; cssClass = 'badge-danger'; }
    else if (status === 'completed') { text = 'Đã hoàn thành'; cssClass = 'badge-success'; }
  }
  else if (type === 'risk') {
    if (status === 'active') { text = 'Hiện hữu'; cssClass = 'badge-danger'; }
    else if (status === 'monitoring') { text = 'Đang theo dõi'; cssClass = 'badge-warning'; }
    else if (status === 'mitigated') { text = 'Đã giảm nhẹ'; cssClass = 'badge-info'; }
    else if (status === 'closed') { text = 'Đã đóng'; cssClass = 'badge-success'; }
  }

  return `<span class="badge ${cssClass}">${text}</span>`;
}

// --- CORE APP INITIATION ---
document.addEventListener('DOMContentLoaded', () => {
  setupNumberFormatting();
  initApp();
  setupEventListeners();
  lucide.createIcons();
});

function initApp() {
  const projects = window.db.getProjects();
  if (projects.length === 0) {
    window.db.reset();
  }

  populateProjectSelector();
  
  // Đọc dự án đang chọn từ localStorage hoặc mặc định là 'all'
  const savedProjId = localStorage.getItem('antigravity_current_project_id');
  const projSelect = document.getElementById('global-project-select');
  
  if (savedProjId && (savedProjId === 'all' || window.db.getProjectById(savedProjId))) {
    state.currentProjectId = savedProjId;
    projSelect.value = savedProjId;
  } else {
    state.currentProjectId = 'all';
    projSelect.value = 'all';
  }

  // Khởi tạo cán bộ select dropdowns
  populateOfficerSelects();

  // Áp dụng branding công ty nếu có
  applyBranding();

  // Thiết lập file uploaders
  setupFileUploaders();

  // Khởi tạo tab mặc định
  switchTab(state.activeTab);
}

function populateProjectSelector() {
  const select = document.getElementById('global-project-select');
  const projects = window.db.getProjects();
  select.innerHTML = '';
  
  // Thêm tùy chọn Xem tất cả các dự án
  const allOption = document.createElement('option');
  allOption.value = 'all';
  allOption.textContent = '--- [ TẤT CẢ DỰ ÁN ] ---';
  select.appendChild(allOption);
  
  projects.forEach(p => {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = p.name;
    select.appendChild(option);
  });
}
// ============================================================
// FILE UPLOADER HELPER
// ============================================================
/**
 * Gắn sự kiện thay đổi file vào input[type=file],
 * đọc file thành Base64 rồi ghi vào hidden input data và hiển thị tên file.
 */
function setupSingleFileUploader(fileInputId, hiddenDataId, nameDisplayId) {
  const fileInput = document.getElementById(fileInputId);
  if (!fileInput) return;
  fileInput.addEventListener('change', function () {
    const file = this.files[0];
    if (!file) return;
    // Giới hạn 800 KB để tránh localStorage overflow
    if (file.size > 800 * 1024) {
      alert(`File quá lớn (${(file.size/1024).toFixed(0)} KB). Vui lòng chọn file nhỏ hơn 800 KB.`);
      this.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
      const dataEl = document.getElementById(hiddenDataId);
      const nameEl = document.getElementById(nameDisplayId);
      if (dataEl) dataEl.value = e.target.result;
      if (nameEl) nameEl.value = file.name;
    };
    reader.readAsDataURL(file);
  });
}

function setupFileUploaders() {
  // Vật tư CĐT cấp
  setupSingleFileUploader('form-material-attachment-file', 'form-material-attachment-data', 'form-material-attachment-name');
  // Khấu trừ hỗ trợ
  setupSingleFileUploader('form-support-deduction-attachment-file', 'form-support-deduction-attachment-data', 'form-support-deduction-attachment-name');
  // Khấu trừ phạt
  setupSingleFileUploader('form-penalty-deduction-attachment-file', 'form-penalty-deduction-attachment-data', 'form-penalty-deduction-attachment');
  // Branding logo
  const brandingLogoFile = document.getElementById('branding-logo-file');
  if (brandingLogoFile) {
    brandingLogoFile.addEventListener('change', function () {
      const file = this.files[0];
      if (!file) return;
      if (file.size > 500 * 1024) {
        alert(`Logo quá lớn (${(file.size/1024).toFixed(0)} KB). Vui lòng chọn file nhỏ hơn 500 KB.`);
        this.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = function (e) {
        localStorage.setItem('branding_company_logo', e.target.result);
        // Hiển thị preview nếu có
        const preview = document.getElementById('branding-logo-preview');
        if (preview) {
          preview.src = e.target.result;
          preview.style.display = 'block';
        }
      };
      reader.readAsDataURL(file);
    });
  }
}

// ============================================================
// BRANDING
// ============================================================
function applyBranding() {
  const companyName = localStorage.getItem('branding_company_name');
  const companyLogo = localStorage.getItem('branding_company_logo');

  // Sidebar logo text
  const sidebarText = document.getElementById('sidebar-logo-text');
  if (sidebarText) sidebarText.textContent = companyName || 'AntiGravity PM';

  // Sidebar logo image
  const sidebarImg = document.getElementById('sidebar-company-logo');
  if (sidebarImg) {
    if (companyLogo) {
      sidebarImg.src = companyLogo;
      sidebarImg.style.display = 'block';
    } else {
      sidebarImg.style.display = 'none';
    }
  }

  // Header brand name
  const headerName = document.getElementById('display-company-name');
  if (headerName) headerName.textContent = companyName || '';

  // Header brand logo
  const headerLogo = document.getElementById('display-company-logo');
  if (headerLogo) {
    if (companyLogo) {
      headerLogo.src = companyLogo;
      headerLogo.style.display = 'inline-block';
    } else {
      headerLogo.style.display = 'none';
    }
  }

  // Điền lại form trong tab cán bộ
  const brandNameInput = document.getElementById('branding-company-name');
  if (brandNameInput && companyName) brandNameInput.value = companyName;

  const logoPreview = document.getElementById('branding-logo-preview');
  if (logoPreview) {
    if (companyLogo) {
      logoPreview.src = companyLogo;
      logoPreview.style.display = 'block';
    } else {
      logoPreview.style.display = 'none';
    }
  }
}

// ============================================================
// DOWNLOAD BASE64 FILE
// ============================================================
function downloadBase64File(data, filename) {
  if (!data) return;
  const a = document.createElement('a');
  a.href = data;
  a.download = filename || 'attachment';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function setupEventListeners() {
  document.getElementById('filter-officer-task-person')?.addEventListener('change', renderOfficerTasksDetails);
  document.getElementById('filter-officer-task-type')?.addEventListener('change', renderOfficerTasksDetails);
  document.getElementById('filter-officer-task-status')?.addEventListener('change', renderOfficerTasksDetails);
  document.getElementById('btn-export-officer-tasks')?.addEventListener('click', exportOfficerTasksToExcel);


  // Auto-fill Nhà cung cấp for Vật tư CĐT cấp
  document.getElementById('form-material-contract').addEventListener('change', (e) => {
    const proj = window.db.getProjectById(state.currentProjectId);
    if (proj && proj.contracts) {
      const c = proj.contracts.find(x => x.id === e.target.value);
      if (c) {
        document.getElementById('form-material-supplier').value = c.partner;
      }
    }
  });

  // 1. Đổi dự án trên dropdown
  document.getElementById('global-project-select').addEventListener('change', (e) => {
    state.currentProjectId = e.target.value;
    localStorage.setItem('antigravity_current_project_id', state.currentProjectId);
    
    // Nếu đổi dự án, reset hợp đồng đang chọn ở tab thanh toán
    state.activeContractId = null;
    
    renderActiveTab();
  });

  // 2. Chuyển tab Sidebar
  const menuItems = document.querySelectorAll('.sidebar-menu .menu-item');
  menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tabName = item.getAttribute('data-tab');
      switchTab(tabName);
    });
  });

  // 3. Khôi phục dữ liệu mẫu
  document.getElementById('btn-reset-mock').addEventListener('click', () => {
    if (confirm('Bạn có chắc chắn muốn khôi phục toàn bộ dữ liệu mẫu ban đầu? Mọi chỉnh sửa của bạn sẽ bị xóa.')) {
      window.db.reset();
      initApp();
      alert('Khôi phục dữ liệu thành công!');
    }
  });

  // 4. In báo cáo
  document.getElementById('btn-print-report').addEventListener('click', () => {
    window.print();
  });

  // 4b. Xuất báo cáo Excel chuyên nghiệp
  document.getElementById('btn-export-csv').addEventListener('click', () => {
    exportToExcel();
  });

  // 4c. Sao lưu toàn bộ dữ liệu ra file JSON
  document.getElementById('btn-backup-json').addEventListener('click', () => {
    const backup = {
      app: 'antigravity-pm',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: window.db.getData()
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const d = new Date();
    a.download = `SaoLuu_KSCP_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // 4d. Phục hồi dữ liệu từ file JSON
  document.getElementById('btn-restore-json').addEventListener('click', () => {
    document.getElementById('input-restore-json').click();
  });
  document.getElementById('input-restore-json').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        const data = parsed && parsed.app === 'antigravity-pm' ? parsed.data : parsed;
        if (!data || !Array.isArray(data.projects)) {
          alert('File không đúng định dạng sao lưu của phần mềm này.');
          return;
        }
        if (!confirm(`File sao lưu chứa ${data.projects.length} dự án${parsed.exportedAt ? ' (xuất ngày ' + formatDate(parsed.exportedAt.split('T')[0]) + ')' : ''}.\nPhục hồi sẽ THAY THẾ toàn bộ dữ liệu hiện tại. Tiếp tục?`)) return;
        window.db.saveData(data);
        localStorage.removeItem('antigravity_current_project_id');
        alert('Phục hồi dữ liệu thành công! Ứng dụng sẽ tải lại.');
        location.reload();
      } catch (err) {
        alert('Không đọc được file: ' + err.message);
      }
    };
    reader.readAsText(file);
  });

  // 5. Thêm dự án mới
  document.getElementById('btn-add-new-project').addEventListener('click', () => {
    openProjectModal();
  });

  // 6. Chỉnh sửa thông tin dự án hiện tại (chỉ khả dụng khi chọn 1 dự án)
  document.getElementById('btn-edit-current-project').addEventListener('click', () => {
    if (state.currentProjectId === 'all') { alert('Vui lòng chọn 1 dự án cụ thể ở thanh trên cùng (không chọn Tất cả dự án) trước khi đăng ký/thêm mới.'); return; }
    const proj = window.db.getProjectById(state.currentProjectId);
    if (proj) openProjectModal(proj);
  });

  // 7. Xoá dự án hiện tại (chỉ khả dụng khi chọn 1 dự án)
  document.getElementById('btn-delete-current-project').addEventListener('click', () => {
    if (state.currentProjectId === 'all') { alert('Vui lòng chọn 1 dự án cụ thể ở thanh trên cùng (không chọn Tất cả dự án) trước khi đăng ký/thêm mới.'); return; }
    const proj = window.db.getProjectById(state.currentProjectId);
    if (proj) {
      if (confirm(`Bạn có chắc chắn muốn xóa toàn bộ dự án "${proj.name}" cùng tất cả hợp đồng, ngân sách, thanh toán liên quan?`)) {
        window.db.deleteProject(state.currentProjectId);
        localStorage.removeItem('antigravity_current_project_id');
        initApp();
        alert('Xóa dự án thành công!');
      }
    }
  });

  // 8. Đóng modal khi click dấu &times; hoặc nút Hủy
  const modals = document.querySelectorAll('.modal-overlay');
  modals.forEach(modal => {
    const closeBtn = modal.querySelector('.modal-close-btn');
    const cancelBtn = modal.querySelector('.modal-cancel-btn');
    
    const close = () => modal.classList.remove('active');
    
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (cancelBtn) cancelBtn.addEventListener('click', close);
    
    modal.addEventListener('click', (e) => {
      // if (e.target === modal) close(); // Vô hiệu hóa đóng modal khi click ra ngoài
    });
  });

  // --- LẮNG NGHE SỰ KIỆN CÁC NÚT THÊM / CẬP NHẬT TRÊN TAB CONTENT ---
  
  // Tab TMĐT
  document.getElementById('btn-edit-tmdt-categories').addEventListener('click', () => {
    if (state.currentProjectId === 'all') { alert('Vui lòng chọn 1 dự án cụ thể ở thanh trên cùng (không chọn Tất cả dự án) trước khi đăng ký/thêm mới.'); return; }
    const proj = window.db.getProjectById(state.currentProjectId);
    if (proj) openTmdtCategoriesModal(proj.tmdt);
  });

  // Đổi dropdown chọn giai đoạn TMĐT trong Modal
  document.getElementById('form-tmdt-stage-select').addEventListener('change', (e) => {
    const stage = e.target.value;
    const proj = window.db.getProjectById(state.currentProjectId);
    if (proj) {
      fillTmdtCategoryInputs(proj.tmdt, stage);
    }
  });

  // Tab Ngân sách gói thầu
  document.getElementById('btn-add-budget').addEventListener('click', () => {
    if (state.currentProjectId === 'all') { alert('Vui lòng chọn 1 dự án cụ thể ở thanh trên cùng (không chọn Tất cả dự án) trước khi đăng ký/thêm mới.'); return; }
    openBudgetModal();
  });

  // Tab Đấu thầu
  document.getElementById('btn-add-bid').addEventListener('click', () => {
    if (state.currentProjectId === 'all') { alert('Vui lòng chọn 1 dự án cụ thể ở thanh trên cùng (không chọn Tất cả dự án) trước khi đăng ký/thêm mới.'); return; }
    openBidModal();
  });

  // Lắp sự kiện đổi ngân sách gói thầu trong modal để cập nhật tiền tố mã gói thầu
  document.getElementById('form-bid-budget').addEventListener('change', (e) => {
    const budgetId = e.target.value;
    const proj = window.db.getProjectById(state.currentProjectId);
    if (proj) {
      const bg = proj.budgets.find(item => item.id === budgetId);
      if (bg) {
        document.getElementById('form-bid-code-prefix').value = bg.code;
        
        const idInput = document.getElementById('form-bid-id');
        if (!idInput.value) {
          document.getElementById('form-bid-name').value = 'Gói thầu: ' + bg.name.replace('Hạng mục: ', '');
          
          // Gợi ý số thứ tự tiếp theo (ví dụ: 01, 02, ...)
          const matchingBids = proj.bids.filter(b => b.budgetId === budgetId);
          const count = matchingBids.length + 1;
          const countStr = count < 10 ? '0' + count : count;
          document.getElementById('form-bid-code-suffix').value = countStr;
        }
      } else {
        document.getElementById('form-bid-code-prefix').value = '';
      }
    }
  });

  // Tab Hợp đồng & PLHĐ
  document.getElementById('btn-add-contract').addEventListener('click', () => {
    if (state.currentProjectId === 'all') { alert('Vui lòng chọn 1 dự án cụ thể ở thanh trên cùng (không chọn Tất cả dự án) trước khi đăng ký/thêm mới.'); return; }
    openContractModal();
  });

  document.getElementById('btn-add-addendum').addEventListener('click', () => {
    if (state.currentProjectId === 'all') { alert('Vui lòng chọn 1 dự án cụ thể ở thanh trên cùng (không chọn Tất cả dự án) trước khi đăng ký/thêm mới.'); return; }
    openAddendumModal();
  });

  // Tab Phát sinh
  document.getElementById('btn-add-variation').addEventListener('click', () => {
    if (state.currentProjectId === 'all') { alert('Vui lòng chọn 1 dự án cụ thể ở thanh trên cùng (không chọn Tất cả dự án) trước khi đăng ký/thêm mới.'); return; }
    openVariationModal();
  });

  // Tab Thanh toán & SLA
  document.getElementById('btn-add-payment').addEventListener('click', () => {
    if (state.currentProjectId === 'all') { alert('Vui lòng chọn 1 dự án cụ thể ở thanh trên cùng (không chọn Tất cả dự án) trước khi đăng ký/thêm mới.'); return; }
    if (!state.activeContractId) {
      alert('Vui lòng chọn hoặc đăng ký một Hợp đồng trước khi lập đợt thanh toán.');
      return;
    }
    openPaymentModal(null, state.activeContractId);
  });

  document.getElementById('payment-contract-select').addEventListener('change', (e) => {
    state.activeContractId = e.target.value;
    renderPaymentsTab();
  });

  document.getElementById('btn-save-sla').addEventListener('click', (e) => {
    e.preventDefault();
    saveSlaSettings();
  });

  // Lắng nghe thay đổi hợp đồng trong modal PLHĐ để tải các phát sinh tương ứng
  document.getElementById('form-addendum-contract').addEventListener('change', (e) => {
    const contractId = e.target.value;
    loadAddendumVariationsSelector(contractId);
  });

  // Tự động tính toán Số tiền thực tế giải ngân trong modal thanh toán
  const payCalcFields = [
    'form-payment-request',
    'form-payment-deduction-advance',
    'form-payment-deduction-material',
    'form-payment-deduction-electricity',
    'form-payment-deduction-water',
    'form-payment-deduction-penalty',
    'form-payment-deduction-cross',
    'form-payment-deduction-other',
    'form-payment-retention'
  ];
  payCalcFields.forEach(fieldId => {
    const el = document.getElementById(fieldId);
    if (el) {
      el.addEventListener('input', () => {
        calculateActualPaidInModal();
      });
    }
  });

  // Tab Rủi ro
  document.getElementById('btn-add-risk').addEventListener('click', () => {
    if (state.currentProjectId === 'all') { alert('Vui lòng chọn 1 dự án cụ thể ở thanh trên cùng (không chọn Tất cả dự án) trước khi đăng ký/thêm mới.'); return; }
    openRiskModal();
  });

  // --- SUBMIT CÁC FORM TRÊN DIALOGS ---

  // Form Dự án
  document.getElementById('btn-save-project').addEventListener('click', (e) => {
    e.preventDefault();
    submitProjectForm();
  });

  // Form TMĐT Ma trận theo Giai đoạn
  document.getElementById('btn-save-tmdt-categories').addEventListener('click', (e) => {
    e.preventDefault();
    submitTmdtCategoriesForm();
  });

  // Lắp sự kiện nhập liệu động trong TMĐT để tính tổng cộng trong modal
  const catInputs = document.querySelectorAll('.tmdt-cat-input');
  catInputs.forEach(input => {
    input.addEventListener('input', () => {
      let total = 0;
      catInputs.forEach(inp => {
        total += parseFloat(parseVNNumber(inp.value)) || 0;
      });
      document.getElementById('modal-tmdt-cat-total').textContent = formatVND(total);
    });
  });

  // Form Ngân sách
  document.getElementById('btn-save-budget').addEventListener('click', (e) => {
    e.preventDefault();
    submitBudgetForm();
  });

  // Form Tiến độ WBS dùng chung
  document.getElementById('btn-save-wbs-schedule').addEventListener('click', (e) => {
    e.preventDefault();
    submitWbsScheduleForm();
  });

  // Form Đấu thầu
  document.getElementById('btn-save-bid').addEventListener('click', (e) => {
    e.preventDefault();
    submitBidForm();
  });

  // Form Hợp đồng
  document.getElementById('btn-save-contract').addEventListener('click', (e) => {
    e.preventDefault();
    submitContractForm();
  });

  // Form Thanh toán
  document.getElementById('btn-save-payment').addEventListener('click', (e) => {
    e.preventDefault();
    submitPaymentForm();
  });

  // Form Rủi ro
  document.getElementById('btn-save-risk').addEventListener('click', (e) => {
    e.preventDefault();
    submitRiskForm();
  });

  // Form Phát sinh
  document.getElementById('btn-save-variation').addEventListener('click', (e) => {
    e.preventDefault();
    submitVariationForm();
  });

  // Form Phụ lục Hợp đồng
  document.getElementById('btn-save-addendum').addEventListener('click', (e) => {
    e.preventDefault();
    submitAddendumForm();
  });

  // Tab Cán bộ
  const btnAddOfficer = document.getElementById('btn-add-officer');
  if (btnAddOfficer) {
    btnAddOfficer.addEventListener('click', () => {
      openOfficerModal();
    });
  }

  const btnSaveOfficer = document.getElementById('btn-save-officer');
  if (btnSaveOfficer) {
    btnSaveOfficer.addEventListener('click', (e) => {
      e.preventDefault();
      submitOfficerForm();
    });
  }

  // --- CÁC TAB QUẢN LÝ MỚI ---
  // Vật tư
  const btnAddMaterial = document.getElementById('btn-add-material');
  if (btnAddMaterial) {
    btnAddMaterial.addEventListener('click', () => {
      if (state.currentProjectId === 'all') { alert('Vui lòng chọn 1 dự án cụ thể ở thanh trên cùng (không chọn Tất cả dự án) trước khi đăng ký/thêm mới.'); return; }
      openMaterialModal();
    });
  }
  const btnSaveMaterial = document.getElementById('btn-save-material');
  if (btnSaveMaterial) {
    btnSaveMaterial.addEventListener('click', (e) => {
      e.preventDefault();
      submitMaterialForm();
    });
  }

  // Khấu trừ hỗ trợ
  const btnAddSupportDeduction = document.getElementById('btn-add-support-deduction');
  if (btnAddSupportDeduction) {
    btnAddSupportDeduction.addEventListener('click', () => {
      if (state.currentProjectId === 'all') { alert('Vui lòng chọn 1 dự án cụ thể ở thanh trên cùng (không chọn Tất cả dự án) trước khi đăng ký/thêm mới.'); return; }
      openSupportDeductionModal();
    });
  }
  const btnSaveSupportDeduction = document.getElementById('btn-save-support-deduction');
  if (btnSaveSupportDeduction) {
    btnSaveSupportDeduction.addEventListener('click', (e) => {
      e.preventDefault();
      submitSupportDeductionForm();
    });
  }

  // Khấu trừ phạt
  const btnAddPenaltyDeduction = document.getElementById('btn-add-penalty-deduction');
  if (btnAddPenaltyDeduction) {
    btnAddPenaltyDeduction.addEventListener('click', () => {
      if (state.currentProjectId === 'all') { alert('Vui lòng chọn 1 dự án cụ thể ở thanh trên cùng (không chọn Tất cả dự án) trước khi đăng ký/thêm mới.'); return; }
      openPenaltyDeductionModal();
    });
  }
  const btnSavePenaltyDeduction = document.getElementById('btn-save-penalty-deduction');
  if (btnSavePenaltyDeduction) {
    btnSavePenaltyDeduction.addEventListener('click', (e) => {
      e.preventDefault();
      submitPenaltyDeductionForm();
    });
  }

  // Tab AI
  const btnSaveApiKey = document.getElementById('btn-save-api-key');
  if (btnSaveApiKey) {
    btnSaveApiKey.addEventListener('click', async () => {
      const provider = document.getElementById('ai-provider-select')?.value || 'gemini';
      const apiKey = document.getElementById('ai-api-key').value.trim();
      const model = document.getElementById('ai-model-select').value;
      if (!apiKey) {
        alert('Vui lòng nhập API Key trước khi lưu.');
        return;
      }
      localStorage.setItem('antigravity_ai_provider', provider);
      localStorage.setItem(`antigravity_${provider}_api_key`, apiKey);
      localStorage.setItem(`antigravity_${provider}_model`, model);
      
      // Khởi tạo/kiểm tra model nếu là Gemini
      if (provider === 'gemini') {
        localStorage.setItem('antigravity_gemini_api_key', apiKey);
        localStorage.setItem('antigravity_gemini_model', model);
        await fetchAndPopulateModels(apiKey);
      }
      
      applyAiConfigState();
      alert('Đã lưu cấu hình API thành công!');
    });
  }

  const btnEditApiConfig = document.getElementById('btn-edit-api-config');
  if (btnEditApiConfig) {
    btnEditApiConfig.addEventListener('click', () => {
      const configCard = document.getElementById('ai-config-card');
      const successBanner = document.getElementById('ai-config-success');
      if (configCard) configCard.style.display = '';
      if (successBanner) successBanner.style.display = 'none';
    });
  }

  const providerSelect = document.getElementById('ai-provider-select');
  if (providerSelect) {
    providerSelect.addEventListener('change', () => {
      updateAiProviderUI();
    });
  }

  const modelSelect = document.getElementById('ai-model-select');
  if (modelSelect) {
    modelSelect.addEventListener('change', () => {
      const provider = document.getElementById('ai-provider-select')?.value || 'gemini';
      localStorage.setItem(`antigravity_${provider}_model`, modelSelect.value);
      if (provider === 'gemini') {
        localStorage.setItem('antigravity_gemini_model', modelSelect.value);
      }
    });
  }

  const btnSendChat = document.getElementById('btn-send-chat');
  if (btnSendChat) {
    btnSendChat.addEventListener('click', () => {
      const input = document.getElementById('ai-chat-input');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      appendChatMessage('user', text);
      askGemini(text);
    });
  }

  const chatInput = document.getElementById('ai-chat-input');
  if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const text = chatInput.value.trim();
        if (!text) return;
        chatInput.value = '';
        appendChatMessage('user', text);
        askGemini(text);
      }
    });
  }

  document.querySelectorAll('.suggested-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const question = btn.getAttribute('data-question');
      appendChatMessage('user', question);
      askGemini(question);
    });
  });

  const varContractSelect = document.getElementById('form-variation-contract');
  if (varContractSelect) {
    varContractSelect.addEventListener('change', (e) => {
      const proj = window.db.getProjectById(state.currentProjectId);
      if (proj) {
        const contract = proj.contracts.find(c => c.id === e.target.value);
        if (contract) {
          document.getElementById('form-variation-code').value = contract.code;
        } else {
          document.getElementById('form-variation-code').value = '';
        }
      }
    });
  }

  // Lắng nghe sự kiện click nút "Hôm nay"
  document.addEventListener('click', (e) => {
    const btnToday = e.target.closest('.btn-today');
    if (btnToday) {
      e.preventDefault();
      const targetId = btnToday.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (input) {
        input.value = new Date().toISOString().split('T')[0];
        input.dispatchEvent(new Event('input'));
        input.dispatchEvent(new Event('change'));
      }
    }
  });

  // Lắng nghe nút Phân tích Rủi ro bằng AI
  const btnAiAnalyzeRisks = document.getElementById('btn-ai-analyze-risks');
  if (btnAiAnalyzeRisks) {
    btnAiAnalyzeRisks.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('ai');
      const chatInput = document.getElementById('ai-chat-input');
      if (chatInput) {
        chatInput.value = "Hãy phân tích tình hình rủi ro chi phí của dự án này, đánh giá các rủi ro trọng điểm và đề xuất phương án ứng phó chi tiết?";
        const btnSendChat = document.getElementById('btn-send-chat');
        if (btnSendChat) {
          btnSendChat.click();
        }
      }
    });
  }

  // Lắng nghe tải file mẫu
  document.addEventListener('click', (e) => {
    const btnTemplate = e.target.closest('.btn-download-template');
    if (btnTemplate) {
      e.preventDefault();
      const type = btnTemplate.getAttribute('data-type');
      downloadExcelTemplate(type);
      return;
    }

    const btnTplMat = e.target.closest('#btn-template-materials');
    if (btnTplMat) {
      e.preventDefault();
      downloadExcelTemplate('materials');
      return;
    }
    const btnTplSup = e.target.closest('#btn-template-support-deductions');
    if (btnTplSup) {
      e.preventDefault();
      downloadExcelTemplate('support-deductions');
      return;
    }
    const btnTplPen = e.target.closest('#btn-template-penalty-deductions');
    if (btnTplPen) {
      e.preventDefault();
      downloadExcelTemplate('penalty-deductions');
      return;
    }
  });

  // Lắng nghe nút kích hoạt Import ẩn
  document.addEventListener('click', (e) => {
    const btnTrigger = e.target.closest('.btn-import-trigger');
    if (btnTrigger) {
      e.preventDefault();
      const targetId = btnTrigger.getAttribute('data-target');
      const fileInput = document.getElementById(targetId);
      if (fileInput) {
        fileInput.click();
      }
      return;
    }

    const btnImpMat = e.target.closest('#btn-import-materials');
    if (btnImpMat) {
      e.preventDefault();
      const fileInput = document.getElementById('file-import-materials');
      if (fileInput) fileInput.click();
      return;
    }
    const btnImpSup = e.target.closest('#btn-import-support-deductions');
    if (btnImpSup) {
      e.preventDefault();
      const fileInput = document.getElementById('file-import-support-deductions');
      if (fileInput) fileInput.click();
      return;
    }
    const btnImpPen = e.target.closest('#btn-import-penalty-deductions');
    if (btnImpPen) {
      e.preventDefault();
      const fileInput = document.getElementById('file-import-penalty-deductions');
      if (fileInput) fileInput.click();
      return;
    }
  });

  // Lắng nghe sự kiện thay đổi file chọn import
  document.addEventListener('change', (e) => {
    if (e.target && e.target.classList.contains('csv-import-input')) {
      const type = e.target.getAttribute('data-type');
      const file = e.target.files[0];
      if (!file) return;
      importExcelFile(type, file);
      e.target.value = ''; // Reset file input
      return;
    }

    if (e.target && e.target.id === 'file-import-materials') {
      const file = e.target.files[0];
      if (!file) return;
      importExcelFile('materials', file);
      e.target.value = '';
      return;
    }
    if (e.target && e.target.id === 'file-import-support-deductions') {
      const file = e.target.files[0];
      if (!file) return;
      importExcelFile('support-deductions', file);
      e.target.value = '';
      return;
    }
    if (e.target && e.target.id === 'file-import-penalty-deductions') {
      const file = e.target.files[0];
      if (!file) return;
      importExcelFile('penalty-deductions', file);
      e.target.value = '';
      return;
    }
  });

  // Lắng nghe click các hyperlink điều hướng tab-link
  document.addEventListener('click', (e) => {
    const tabLink = e.target.closest('.tab-link');
    if (tabLink) {
      e.preventDefault();
      const tabName = tabLink.getAttribute('data-tab');
      const contractId = tabLink.getAttribute('data-contract-id');
      const budgetCode = tabLink.getAttribute('data-budget-code');
      const bidId = tabLink.getAttribute('data-bid-id');
      const varId = tabLink.getAttribute('data-variation-id');
      const addendumId = tabLink.getAttribute('data-addendum-id');
      
      if (contractId) {
        state.activeContractId = contractId;
      }
      
      switchTab(tabName);
      
      // Highlight dòng
      setTimeout(() => {
        let rowToHighlight = null;
        if (budgetCode) {
          rowToHighlight = Array.from(document.querySelectorAll('#budgets-table tbody tr')).find(tr => tr.innerText.includes(budgetCode));
        } else if (bidId) {
          rowToHighlight = Array.from(document.querySelectorAll('#bids-table tbody tr')).find(tr => {
            const btn = tr.querySelector('.edit-bid-btn');
            return btn && btn.getAttribute('data-id') === bidId;
          });
        } else if (contractId && tabName === 'contracts') {
          rowToHighlight = Array.from(document.querySelectorAll('#contracts-table tbody tr')).find(tr => {
            const btn = tr.querySelector('.edit-ctr-btn');
            return btn && btn.getAttribute('data-id') === contractId;
          });
        } else if (varId) {
          rowToHighlight = Array.from(document.querySelectorAll('#variations-table tbody tr')).find(tr => {
            const btn = tr.querySelector('.edit-var-btn');
            return btn && btn.getAttribute('data-id') === varId;
          });
        } else if (addendumId) {
          rowToHighlight = Array.from(document.querySelectorAll('#addendums-table tbody tr')).find(tr => {
            const btn = tr.querySelector('.edit-addendum-btn');
            return btn && btn.getAttribute('data-id') === addendumId;
          });
        }
        
        if (rowToHighlight) {
          rowToHighlight.style.background = 'rgba(99, 102, 241, 0.2)';
          rowToHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => {
            rowToHighlight.style.background = '';
          }, 3000);
        }
      }, 300);
    }
  });

  // --- Lưu Branding Doanh nghiệp ---
  const btnSaveBranding = document.getElementById('btn-save-branding');
  if (btnSaveBranding) {
    btnSaveBranding.addEventListener('click', () => {
      const nameInput = document.getElementById('branding-company-name');
      const companyName = nameInput ? nameInput.value.trim() : '';
      if (companyName) {
        localStorage.setItem('branding_company_name', companyName);
      } else {
        localStorage.removeItem('branding_company_name');
      }
      // Logo đã được lưu vào localStorage bởi file uploader
      applyBranding();
      alert('✅ Đã lưu thông tin thương hiệu doanh nghiệp!');
    });
  }

  // --- Delegated click: Tải file đính kèm ---
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-download-file');
    if (!btn) return;
    e.preventDefault();

    const itemId = btn.dataset.id;
    const itemType = btn.dataset.type;
    let found = null;

    const proj = window.db.getProjectById(state.currentProjectId);
    const projects = state.currentProjectId === 'all' ? window.db.getProjects() : (proj ? [proj] : []);

    for (const p of projects) {
      if (itemType === 'material') {
        found = (p.materials || []).find(m => m.id === itemId);
      } else if (itemType === 'support-deduction') {
        found = (p.supportDeductions || []).find(sd => sd.id === itemId);
      } else if (itemType === 'penalty-deduction') {
        found = (p.penaltyDeductions || []).find(pd => pd.id === itemId);
      }
      if (found) break;
    }

    if (found && found.attachmentData) {
      downloadBase64File(found.attachmentData, found.attachmentName || 'attachment');
    } else {
      alert('Không tìm thấy file đính kèm.');
    }
  });
}

function adjustTableHeadersAndActions(tableId) {
  const isAll = state.currentProjectId === 'all';
  
  // 1. Ẩn/hiện cột Dự án của bảng
  if (tableId) {
    const table = document.getElementById(tableId);
    if (table) {
      const colProjects = table.querySelectorAll('.col-project');
      colProjects.forEach(cell => {
        cell.style.display = isAll ? '' : 'none';
      });
    }
  }

  // 2. Ẩn/hiện nút thêm mới ở tab hiện tại
  const addBtn = document.querySelector(`#tab-${state.activeTab} [id^="btn-add-"]`);
  if (addBtn) {
    addBtn.style.display = isAll ? 'none' : '';
  }

  // 3. Ẩn/hiện nút Import ở tab hiện tại
  const importBtn = document.querySelector(`#tab-${state.activeTab} [id^="btn-import-"]`);
  if (importBtn) {
    importBtn.style.display = isAll ? 'none' : '';
  }
  
  const templateBtn = document.querySelector(`#tab-${state.activeTab} [id^="btn-template-"]`);
  if (templateBtn) {
    templateBtn.style.display = isAll ? 'none' : '';
  }
}

function switchTab(tabName) {
  state.activeTab = tabName;
  
  // Update UI Sidebar active
  const menuItems = document.querySelectorAll('.sidebar-menu .menu-item');
  menuItems.forEach(item => {
    if (item.getAttribute('data-tab') === tabName) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Update UI Panels
  const contents = document.querySelectorAll('.tab-content');
  contents.forEach(c => c.classList.remove('active'));
  
  const activeContent = document.getElementById(`tab-${tabName}`);
  if (activeContent) {
    activeContent.classList.add('active');
  }
  
  const btnAddProject = document.getElementById('btn-add-new-project');
  if (btnAddProject) {
    if (tabName === 'projects') {
      btnAddProject.style.display = 'inline-flex';
    } else {
      btnAddProject.style.display = 'none';
    }
  }

  renderActiveTab();
}

function renderActiveTab() {
  lucide.createIcons();

  switch (state.activeTab) {
    case 'dashboard':
      renderDashboardTab();
      break;
    case 'projects':
      renderProjectsTab();
      break;
    case 'tmdt':
      renderTmdtTab();
      break;
    case 'budgets':
      renderBudgetsTab();
      break;
    case 'bids':
      renderBidsTab();
      break;
    case 'contracts':
      renderContractsTab();
      break;
    case 'variations':
      renderVariationsTab();
      break;
    case 'payments':
      renderPaymentsTab();
      break;
    case 'materials':
      renderMaterialsTab();
      break;
    case 'support-deductions':
      renderSupportDeductionsTab();
      break;
    case 'penalty-deductions':
      renderPenaltyDeductionsTab();
      break;
    case 'risks':
      renderRisksTab();
      break;
    case 'officers':
      renderOfficersTab();
      break;
    case 'ai':
      renderAiTab();
      break;
  }
}

// --- BUSINESS LOGIC CALCULATIONS & ALERTS ---

function getProjectSummary(proj) {
  const summary = {
    tmdtApproved: 0,
    tmdtAdjusted: 0,
    tmdtDesign: 0,
    totalBudget: 0,
    totalContractValue: 0,
    totalDisbursed: 0,
    totalContingencyRisk: 0,
    alerts: []
  };

  // Tính TMĐT từ ma trận
  const cats = ['gpmb', 'construction', 'equipment', 'qlda', 'consulting', 'other', 'contingency'];
  cats.forEach(c => {
    if (proj.tmdt[c]) {
      summary.tmdtDesign += proj.tmdt[c].design || 0;
      summary.tmdtApproved += proj.tmdt[c].approved || 0;
      summary.tmdtAdjusted += proj.tmdt[c].adjusted || 0;
    }
  });

  // 1. Tính tổng ngân sách gói thầu phân bổ
  proj.budgets.forEach(b => summary.totalBudget += b.amount);

  // 2. Tính tổng giá trị hợp đồng (bao gồm cả PLHĐ)
  proj.contracts.forEach(c => {
    if (c.status === 'active' || c.status === 'liquidated') {
      summary.totalContractValue += (c.value || 0);
      const addendumsValue = proj.addendums
        ? proj.addendums.filter(a => a.contractId === c.id && a.status === 'active').reduce((sum, a) => sum + (a.value || 0), 0)
        : 0;
      summary.totalContractValue += addendumsValue;
    }
  });

  // 3. Tính tổng thanh toán thực tế (Paid)
  proj.payments.forEach(p => {
    if (p.status === 'paid') {
      summary.totalDisbursed += p.paidAmount;
    }
  });

  // 4. Tính tổng chi phí rủi ro dự phòng
  proj.risks.forEach(r => {
    if (r.status === 'active' || r.status === 'monitoring') {
      summary.totalContingencyRisk += r.contingencyCost;
    }
  });

  // 5. CẢNH BÁO CHI PHÍ
  // Cảnh báo 1: Tổng Ngân sách phân bổ gói thầu vượt hạn mức xây dựng + thiết bị + tư vấn + qlda + khác của TMĐT Approved
  if (proj.tmdt.construction && proj.tmdt.equipment) {
    const allowedTMDTLimit = 
      (proj.tmdt.construction.approved || 0) + 
      (proj.tmdt.equipment.approved || 0) + 
      (proj.tmdt.consulting.approved || 0) + 
      (proj.tmdt.qlda.approved || 0) + 
      (proj.tmdt.other.approved || 0);
      
    if (summary.totalBudget > allowedTMDTLimit) {
      summary.alerts.push({
        type: 'danger',
        title: 'Hạn mức ngân sách vượt TMĐT được duyệt',
        message: `Tổng ngân sách phân bổ cho các gói thầu (${formatVND(summary.totalBudget)}) vượt hạn mức chi phí xây lắp trong TMĐT phê duyệt (${formatVND(allowedTMDTLimit)}) là ${formatVND(summary.totalBudget - allowedTMDTLimit)}.`
      });
    }
  }

  // Cảnh báo 2: Từng Ngân sách gói thầu bị vượt do giá trị Hợp đồng
  proj.budgets.forEach(b => {
    const linkedBids = proj.bids.filter(bid => bid.budgetId === b.id);
    const linkedBidIds = linkedBids.map(bid => bid.id);
    const linkedContracts = proj.contracts.filter(c => linkedBidIds.includes(c.bidId) && (c.status === 'active' || c.status === 'liquidated'));
    
    let totalSigned = 0;
    linkedContracts.forEach(c => totalSigned += c.value);

    if (totalSigned > b.amount) {
      summary.alerts.push({
        type: 'danger',
        title: `Vượt Ngân sách gói thầu: ${esc(b.code)}`,
        message: `Gói thầu "${esc(b.name)}" có ngân sách được duyệt là ${formatVND(b.amount)} nhưng tổng giá trị hợp đồng đã ký kết thực tế là ${formatVND(totalSigned)} (Vượt ${formatVND(totalSigned - b.amount)}).`
      });
    }
  });

  // Cảnh báo 3: Kết quả thầu vượt dự toán thầu
  proj.bids.forEach(b => {
    if (b.status === 'awarded' && b.bidAmount > b.estimateAmount) {
      summary.alerts.push({
        type: 'warning',
        title: `Vượt Giá gói thầu dự toán: ${esc(b.code)}`,
        message: `Gói thầu "${esc(b.name)}" trúng thầu với giá ${formatVND(b.bidAmount)}, vượt giá dự toán thầu được duyệt (${formatVND(b.estimateAmount)}) một khoản là ${formatVND(b.bidAmount - b.estimateAmount)}.`
      });
    }
  });

  // Cảnh báo 4: Đợt thanh toán hợp đồng vượt giá trị hợp đồng
  proj.contracts.forEach(c => {
    if (c.status === 'active') {
      const linkedPayments = proj.payments.filter(p => p.contractId === c.id);
      
      let totalPaidAndApproved = 0;
      linkedPayments.forEach(p => {
        if (p.status === 'paid') totalPaidAndApproved += p.paidAmount;
        else if (p.status === 'approved') totalPaidAndApproved += p.requestAmount;
      });

      if (totalPaidAndApproved > c.value) {
        summary.alerts.push({
          type: 'danger',
          title: `Lũy kế giải ngân vượt Hợp đồng: ${esc(c.code)}`,
          message: `Tổng số tiền đã trả và duyệt chi cho nhà thầu ${esc(c.partner)} là ${formatVND(totalPaidAndApproved)}, vượt giá trị hợp đồng ký kết ban đầu (${formatVND(c.value)}) là ${formatVND(totalPaidAndApproved - c.value)}.`
        });
      }
    }
  });

  return summary;
}

// --- RENDER TAB PANELS ---

// 1. Tab Dashboard
function renderDashboardTab() {
  if (state.currentProjectId === 'all') {
    document.getElementById('dashboard-single-project-view').style.display = 'none';
    document.getElementById('dashboard-all-projects-view').style.display = 'block';
    renderAllProjectsDashboard();
  } else {
    document.getElementById('dashboard-all-projects-view').style.display = 'none';
    document.getElementById('dashboard-single-project-view').style.display = 'block';
    renderSingleProjectDashboard();
  }
}

// 1.1. Dashboard toàn bộ dự án
function renderAllProjectsDashboard() {
  const projects = window.db.getProjects();
  
  // Đổi nhãn KPI
  document.getElementById('kpi-tmdt-label').textContent = "Tổng TMĐT hệ thống";
  
  // Tính tổng tích lũy
  let systemTmdt = 0;
  let systemContracts = 0;
  let systemDisbursed = 0;
  let systemRisks = 0;

  projects.forEach(p => {
    const summary = getProjectSummary(p);
    systemTmdt += summary.tmdtApproved; // Lấy theo TMĐT Phê duyệt Approved
    systemContracts += summary.totalContractValue;
    systemDisbursed += summary.totalDisbursed;
    systemRisks += summary.totalContingencyRisk;
  });

  document.getElementById('kpi-tmdt').textContent = formatVND(systemTmdt);
  document.getElementById('kpi-contract').textContent = formatVND(systemContracts);
  document.getElementById('kpi-disbursed').textContent = formatVND(systemDisbursed);
  document.getElementById('kpi-risk').textContent = formatVND(systemRisks);

  // Render bảng báo cáo danh sách tất cả các dự án
  const tableBody = document.querySelector('#dashboard-all-projects-table tbody');
  tableBody.innerHTML = '';

  projects.forEach(p => {
    const summary = getProjectSummary(p);
    const ratio = summary.totalContractValue > 0 ? ((summary.totalDisbursed / summary.totalContractValue) * 100).toFixed(1) + '%' : '0.0%';
    
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.innerHTML = `
      <td><strong>${p.id}</strong></td>
      <td><strong>${esc(p.name)}</strong></td>
      <td>${esc(p.location)}</td>
      <td style="text-align: right; font-weight: 500;">${formatVND(summary.tmdtApproved)}</td>
      <td style="text-align: right; font-weight: 500;">${formatVND(summary.totalContractValue)}</td>
      <td style="text-align: right; font-weight: 500; color: var(--color-success);">${formatVND(summary.totalDisbursed)}</td>
      <td style="text-align: right; font-weight: 600;">${ratio}</td>
      <td>${getStatusBadge('project', p.status)}</td>
    `;
    
    // Kích hoạt dự án này khi click dòng
    tr.addEventListener('click', () => {
      selectProject(p.id);
    });

    tableBody.appendChild(tr);
  });

  // Vẽ biểu đồ so sánh giữa các dự án
  if (state.charts.allProjectsBar) state.charts.allProjectsBar.destroy();
  
  const ctxAll = document.getElementById('chart-all-projects-comparison').getContext('2d');
  const projectNames = projects.map(p => p.name);
  const projectTmdts = projects.map(p => getProjectSummary(p).tmdtApproved);
  const projectContracts = projects.map(p => getProjectSummary(p).totalContractValue);
  const projectDisburseds = projects.map(p => getProjectSummary(p).totalDisbursed);

  state.charts.allProjectsBar = new Chart(ctxAll, {
    type: 'bar',
    data: {
      labels: projectNames,
      datasets: [
        {
          label: 'TMĐT Phê duyệt',
          data: projectTmdts,
          backgroundColor: 'rgba(14, 165, 233, 0.45)',
          borderColor: '#0ea5e9',
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: 'Hợp đồng đã ký',
          data: projectContracts,
          backgroundColor: 'rgba(99, 102, 241, 0.55)',
          borderColor: '#6366f1',
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: 'Thực tế giải ngân',
          data: projectDisburseds,
          backgroundColor: 'rgba(16, 185, 129, 0.55)',
          borderColor: '#10b981',
          borderWidth: 1,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#94a3b8' }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return ' ' + context.dataset.label + ': ' + formatVND(context.raw);
            }
          }
        }
      },
      scales: {
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#94a3b8',
            callback: function(val) {
              if (val >= 1e9) return (val / 1e9) + ' tỷ';
              if (val >= 1e6) return (val / 1e6) + ' tr';
              return val;
            }
          }
        },
        x: {
          ticks: { color: '#94a3b8' },
          grid: { display: false }
        }
      }
    }
  });
}

// 1.2. Dashboard chi tiết một dự án
function renderSingleProjectDashboard() {
  const proj = window.db.getProjectById(state.currentProjectId);
  if (!proj) return;

  // Đổi nhãn KPI
  document.getElementById('kpi-tmdt-label').textContent = "Tổng Mức Đầu Tư (Duyệt)";

  const summary = getProjectSummary(proj);

  // Điền chỉ số
  document.getElementById('kpi-tmdt').textContent = formatVND(summary.tmdtApproved); // Lấy Approved làm TMĐT gốc
  document.getElementById('kpi-contract').textContent = formatVND(summary.totalContractValue);
  document.getElementById('kpi-disbursed').textContent = formatVND(summary.totalDisbursed);
  document.getElementById('kpi-risk').textContent = formatVND(summary.totalContingencyRisk);

  // Render alerts
  const alertsContainer = document.getElementById('dashboard-alerts-container');
  alertsContainer.innerHTML = '';

  if (summary.alerts.length === 0) {
    alertsContainer.innerHTML = `
      <div class="alert-box" style="background: rgba(16, 185, 129, 0.08); border-color: rgba(16, 185, 129, 0.2); color: #a7f3d0;">
        <i data-lucide="check-circle" style="color: var(--color-success)"></i>
        <span>An toàn: Hệ thống không phát hiện rủi ro vượt ngân sách hay chênh lệch đấu thầu nào cho dự án hiện tại.</span>
      </div>
    `;
  } else {
    summary.alerts.forEach(alert => {
      const indicator = document.createElement('div');
      indicator.className = 'warning-indicator';
      if (alert.type === 'danger') {
        indicator.style.background = 'rgba(244, 63, 94, 0.06)';
        indicator.style.borderColor = 'rgba(244, 63, 94, 0.25)';
      }
      indicator.innerHTML = `
        <i data-lucide="${alert.type === 'danger' ? 'alert-triangle' : 'alert-circle'}" style="color: ${alert.type === 'danger' ? 'var(--color-danger)' : 'var(--color-warning)'}"></i>
        <div class="warning-details">
          <h4 style="color: ${alert.type === 'danger' ? '#fecdd3' : '#fef08a'}">${alert.title}</h4>
          <p>${alert.message}</p>
        </div>
      `;
      alertsContainer.appendChild(indicator);
    });
  }

  // Render risks
  const riskTableBody = document.querySelector('#dashboard-risks-table tbody');
  riskTableBody.innerHTML = '';
  const activeRisks = proj.risks.filter(r => r.status === 'active' || r.status === 'monitoring');
  
  if (activeRisks.length === 0) {
    riskTableBody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-dim);">Không có rủi ro nào đang hoạt động.</td></tr>`;
  } else {
    activeRisks.slice(0, 5).forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${esc(r.description)}</td>
        <td>${getStatusBadge('risk', r.status)}</td>
        <td style="text-align: right; font-weight: 500;">${formatVND(r.contingencyCost)}</td>
      `;
      riskTableBody.appendChild(tr);
    });
  }

  lucide.createIcons();

  // Biểu đồ so sánh Bar
  if (state.charts.dashboardBar) state.charts.dashboardBar.destroy();
  const ctxBar = document.getElementById('chart-comparison').getContext('2d');
  state.charts.dashboardBar = new Chart(ctxBar, {
    type: 'bar',
    data: {
      labels: ['TMĐT phê duyệt', 'Ngân sách phân bổ', 'Hợp đồng đã ký', 'Thực tế giải ngân'],
      datasets: [{
        label: 'Giá trị (VNĐ)',
        data: [summary.tmdtApproved, summary.totalBudget, summary.totalContractValue, summary.totalDisbursed],
        backgroundColor: [
          'rgba(14, 165, 233, 0.45)',
          'rgba(245, 158, 11, 0.45)',
          'rgba(99, 102, 241, 0.55)',
          'rgba(16, 185, 129, 0.55)'
        ],
        borderColor: ['#0ea5e9', '#f59e0b', '#6366f1', '#10b981'],
        borderWidth: 1.5,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(ctx) { return ' ' + formatVND(ctx.raw); }
          }
        }
      },
      scales: {
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#94a3b8',
            callback: function(v) {
              if (v >= 1e9) return (v / 1e9) + ' tỷ';
              if (v >= 1e6) return (v / 1e6) + ' tr';
              return v;
            }
          }
        },
        x: { ticks: { color: '#94a3b8' }, grid: { display: false } }
      }
    }
  });

  // Nâng cấp: Vẽ biểu đồ tròn cho TMĐT PHÊ DUYỆT (Approved) theo yêu cầu số 3
  if (state.charts.dashboardDoughnut) state.charts.dashboardDoughnut.destroy();
  const ctxDoughnut = document.getElementById('chart-tmdt-structure').getContext('2d');
  
  const gpmbApproved = (proj.tmdt.gpmb && proj.tmdt.gpmb.approved) || 0;
  const constApproved = (proj.tmdt.construction && proj.tmdt.construction.approved) || 0;
  const equipApproved = (proj.tmdt.equipment && proj.tmdt.equipment.approved) || 0;
  const qldaApproved = (proj.tmdt.qlda && proj.tmdt.qlda.approved) || 0;
  const consultApproved = (proj.tmdt.consulting && proj.tmdt.consulting.approved) || 0;
  const otherApproved = (proj.tmdt.other && proj.tmdt.other.approved) || 0;
  const continApproved = (proj.tmdt.contingency && proj.tmdt.contingency.approved) || 0;

  state.charts.dashboardDoughnut = new Chart(ctxDoughnut, {
    type: 'doughnut',
    data: {
      labels: ['GPMB', 'Xây dựng', 'Thiết bị', 'QLDA', 'Tư vấn', 'Khác', 'Dự phòng'],
      datasets: [{
        data: [gpmbApproved, constApproved, equipApproved, qldaApproved, consultApproved, otherApproved, continApproved],
        backgroundColor: ['#f43f5e', '#6366f1', '#10b981', '#f59e0b', '#0ea5e9', '#8b5cf6', '#64748b'],
        borderWidth: 1,
        borderColor: '#0f172a'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#94a3b8', font: { size: 10 } }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = ((context.raw / total) * 100).toFixed(1) + '%';
              return ' ' + context.label + ': ' + percentage + ' (' + formatVND(context.raw) + ')';
            }
          }
        }
      }
    }
  });
}

// 2. Tab Projects (Lồng Tiến độ chính & Tiến độ gói thầu)
function renderProjectsTab() {
  const proj = window.db.getProjectById(state.currentProjectId);

  // Điền Info (khi đang chọn [Tất cả dự án] thì hiển thị hướng dẫn và ẩn nút sửa/xóa)
  const btnEditProj = document.getElementById('btn-edit-current-project');
  const btnDeleteProj = document.getElementById('btn-delete-current-project');
  if (proj) {
    document.getElementById('detail-project-name').textContent = proj.name;
    document.getElementById('detail-project-location').textContent = proj.location;
    document.getElementById('detail-project-scale').textContent = proj.scale;
    document.getElementById('detail-project-start').textContent = proj.startDate || 'Chưa cập nhật';
    document.getElementById('detail-project-end').textContent = proj.endDate || 'Chưa cập nhật';
    document.getElementById('detail-project-status-badge').innerHTML = getStatusBadge('project', proj.status);
    if (btnEditProj) btnEditProj.style.display = '';
    if (btnDeleteProj) btnDeleteProj.style.display = '';
  } else {
    document.getElementById('detail-project-name').textContent = 'Đang xem [Tất cả dự án] — bấm "Chọn" một dự án trong danh sách bên dưới để xem chi tiết';
    document.getElementById('detail-project-location').textContent = '-';
    document.getElementById('detail-project-scale').textContent = '-';
    document.getElementById('detail-project-start').textContent = '-';
    document.getElementById('detail-project-end').textContent = '-';
    document.getElementById('detail-project-status-badge').innerHTML = '';
    if (btnEditProj) btnEditProj.style.display = 'none';
    if (btnDeleteProj) btnDeleteProj.style.display = 'none';
  }

  // Render Table danh sách dự án
  const projTableBody = document.querySelector('#all-projects-table tbody');
  projTableBody.innerHTML = '';
  
  window.db.getProjects().forEach(p => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    if (p.id === state.currentProjectId) {
      tr.style.background = 'rgba(99, 102, 241, 0.08)';
      tr.style.borderColor = 'rgba(99, 102, 241, 0.3)';
    }

    tr.innerHTML = `
      <td><strong>${p.id}</strong></td>
      <td><span class="badge badge-info" style="font-weight:bold;">${esc(p.code || '')}</span></td>
      <td><strong>${esc(p.name)}</strong></td>
      <td>${esc(p.location)}</td>
      <td>${p.startDate ? p.startDate + ' ~ ' + (p.endDate || '...') : 'Chưa nhập'}</td>
      <td>${getStatusBadge('project', p.status)}</td>
      <td>
        <button class="btn btn-secondary btn-sm btn-icon-only edit-proj-btn" data-id="${p.id}"><i data-lucide="edit-2"></i></button>
        <button class="btn btn-primary btn-sm switch-proj-btn" data-id="${p.id}"><i data-lucide="folder-open"></i>Chọn</button>
      </td>
    `;
    tr.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      selectProject(p.id);
    });
    projTableBody.appendChild(tr);
  });

  // Nút bấm danh sách dự án
  document.querySelectorAll('.edit-proj-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pId = btn.getAttribute('data-id');
      const p = window.db.getProjectById(pId);
      if (p) openProjectModal(p);
    });
  });
  document.querySelectorAll('.switch-proj-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectProject(btn.getAttribute('data-id'));
    });
  });

  // --- RENDER BẢNG TIẾN ĐỘ WBS DUY NHẤT ---
  if (proj) {
    renderWbsSchedule(proj);
  } else {
    const wbsBody = document.querySelector('#wbs-schedule-table tbody');
    if (wbsBody) wbsBody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-dim); padding: 30px 0;">Chọn một dự án cụ thể để xem tiến độ tổng thể.</td></tr>';
  }

  lucide.createIcons();
}

// 3. Tab TMĐT (Nâng cấp Ma trận và Biểu đồ Approved)
function renderTmdtTab() {
  const proj = window.db.getProjectById(state.currentProjectId);
  if (!proj) return;

  const tmdt = proj.tmdt;
  const tableBody = document.querySelector('#tmdt-matrix-table tbody');
  tableBody.innerHTML = '';

  const allBids = proj.bids || [];
  const allContracts = proj.contracts || [];
  const allPayments = proj.payments || [];

  const categoriesList = [
    { key: 'gpmb', name: '1. Chi phí Bồi thường, hỗ trợ & GPMB' },
    { key: 'construction', name: '2. Chi phí Xây dựng' },
    { key: 'equipment', name: '3. Chi phí Thiết bị' },
    { key: 'qlda', name: '4. Chi phí Quản lý dự án' },
    { key: 'consulting', name: '5. Chi phí Tư vấn đầu tư xây dựng' },
    { key: 'other', name: '6. Chi phí Khác' },
    { key: 'contingency', name: '7. Chi phí Dự phòng' }
  ];

  let totalDesign = 0;
  let totalApproved = 0;
  let totalSigned = 0;
  let totalPaid = 0;
  let totalDiff = 0;

  categoriesList.forEach(item => {
    const data = tmdt[item.key] || { design: 0, approved: 0 };
    const design = data.design || 0;
    const approved = data.approved || 0;

    const catBudgets = (proj.budgets || []).filter(b => b.category === item.key);
    const catBudgetIds = catBudgets.map(b => b.id);
    
    const catBids = allBids.filter(bid => catBudgetIds.includes(bid.budgetId));
    const catBidIds = catBids.map(bid => bid.id);
    
    const catContracts = allContracts.filter(c => catBidIds.includes(c.bidId) && (c.status === 'active' || c.status === 'liquidated'));
    const catContractIds = catContracts.map(c => c.id);
    
    const catPayments = allPayments.filter(p => catContractIds.includes(p.contractId) && (p.status === 'paid' || p.status === 'approved'));

    let sumSigned = 0;
    catContracts.forEach(c => sumSigned += c.value);
    
    let sumPaid = 0;
    catPayments.forEach(p => sumPaid += p.paidAmount);

    const diff = sumSigned - approved;

    totalDesign += design;
    totalApproved += approved;
    totalSigned += sumSigned;
    totalPaid += sumPaid;
    totalDiff += diff;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${esc(item.name)}</strong></td>
      <td style="text-align: right; font-weight: 500;">${formatVND(design)}</td>
      <td style="text-align: right; font-weight: 500; color: var(--color-success);">${formatVND(approved)}</td>
      <td style="text-align: right; font-weight: 500; color: var(--color-info);">${formatVND(sumSigned)}</td>
      <td style="text-align: right; font-weight: 500; color: var(--color-primary);">${formatVND(sumPaid)}</td>
      <td style="text-align: right; font-weight: 600; color: ${diff > 0 ? 'var(--color-danger)' : diff < 0 ? 'var(--color-success)' : 'inherit'}">
        ${diff > 0 ? '+' + formatVND(diff) : formatVND(diff)}
      </td>
    `;
    tableBody.appendChild(tr);
  });

  const trTotal = document.createElement('tr');
  trTotal.style.background = 'rgba(255, 255, 255, 0.02)';
  trTotal.style.borderTop = '2px solid var(--border-glass)';
  trTotal.innerHTML = `
    <td><strong>TỔNG CỘNG TMĐT</strong></td>
    <td style="text-align: right; font-weight: 700; color: var(--text-main);">${formatVND(totalDesign)}</td>
    <td style="text-align: right; font-weight: 700; color: var(--color-success);">${formatVND(totalApproved)}</td>
    <td style="text-align: right; font-weight: 700; color: var(--color-info);">${formatVND(totalSigned)}</td>
    <td style="text-align: right; font-weight: 700; color: var(--color-primary);">${formatVND(totalPaid)}</td>
    <td style="text-align: right; font-weight: 700; color: ${totalDiff > 0 ? 'var(--color-danger)' : totalDiff < 0 ? 'var(--color-success)' : 'inherit'}">
      ${totalDiff > 0 ? '+' + formatVND(totalDiff) : formatVND(totalDiff)}
    </td>
  `;
  tableBody.appendChild(trTotal);

  if (state.charts.tmdtDoughnut) state.charts.tmdtDoughnut.destroy();
  const ctxTmdtDetail = document.getElementById('chart-tmdt-structure-detail').getContext('2d');
  
  state.charts.tmdtDoughnut = new Chart(ctxTmdtDetail, {
    type: 'doughnut',
    data: {
      labels: ['GPMB', 'Xây dựng', 'Thiết bị', 'QLDA', 'Tư vấn', 'Khác', 'Dự phòng'],
      datasets: [{
        data: [
          (tmdt.gpmb && tmdt.gpmb.approved) || 0,
          (tmdt.construction && tmdt.construction.approved) || 0,
          (tmdt.equipment && tmdt.equipment.approved) || 0,
          (tmdt.qlda && tmdt.qlda.approved) || 0,
          (tmdt.consulting && tmdt.consulting.approved) || 0,
          (tmdt.other && tmdt.other.approved) || 0,
          (tmdt.contingency && tmdt.contingency.approved) || 0
        ],
        backgroundColor: ['#f43f5e', '#6366f1', '#10b981', '#f59e0b', '#0ea5e9', '#8b5cf6', '#64748b'],
        borderWidth: 1,
        borderColor: '#0f172a'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#94a3b8', font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const percentage = ((context.raw / totalApproved) * 100).toFixed(1) + '%';
              return ' ' + context.label + ': ' + percentage + ' (' + formatVND(context.raw) + ')';
            }
          }
        }
      }
    }
  });
}

// 4. Tab Ngân sách gói thầu
function renderBudgetsTab() {
  adjustTableHeadersAndActions('budgets-table');

  const isAll = state.currentProjectId === 'all';
  const tableBody = document.querySelector('#budgets-table tbody');
  tableBody.innerHTML = '';

  let budgets = [];
  let bids = [];
  let contracts = [];
  let payments = [];

  const projects = isAll ? window.db.getProjects() : [window.db.getProjectById(state.currentProjectId)].filter(Boolean);

  projects.forEach(p => {
    p.budgets.forEach(b => {
      budgets.push({ ...b, projectId: p.id, projectName: p.name });
    });
    p.bids.forEach(bid => bids.push(bid));
    p.contracts.forEach(c => contracts.push(c));
    if (p.payments) p.payments.forEach(pay => payments.push(pay));
  });

  if (budgets.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="${isAll ? 9 : 8}" style="text-align: center; color: var(--text-dim); padding: 30px 0;">Chưa khai báo danh mục ngân sách gói thầu nào.</td></tr>`;
    return;
  }

  const categoriesList = [
    { key: 'gpmb', name: 'I. Chi phí Bồi thường, hỗ trợ & GPMB' },
    { key: 'construction', name: 'II. Chi phí Xây dựng' },
    { key: 'equipment', name: 'III. Chi phí Thiết bị' },
    { key: 'qlda', name: 'IV. Chi phí Quản lý dự án' },
    { key: 'consulting', name: 'V. Chi phí Tư vấn đầu tư xây dựng' },
    { key: 'other', name: 'VI. Chi phí Khác' },
    { key: 'contingency', name: 'VII. Chi phí Dự phòng' }
  ];

  let totalAmountAll = 0;
  let totalSignedAll = 0;
  let totalPaidAll = 0;

  // Xử lý và tính tổng cho toàn bộ danh sách để đưa lên dòng TỔNG CỘNG chung
  budgets.forEach(b => {
    const linkedBids = bids.filter(bid => bid.budgetId === b.id);
    const linkedBidIds = linkedBids.map(bid => bid.id);
    const linkedContracts = contracts.filter(c => linkedBidIds.includes(c.bidId) && (c.status === 'active' || c.status === 'liquidated'));
    const linkedContractIds = linkedContracts.map(c => c.id);
    const linkedPayments = payments.filter(p => linkedContractIds.includes(p.contractId) && (p.status === 'paid' || p.status === 'approved'));

    let ts = 0, tp = 0;
    linkedContracts.forEach(c => ts += c.value);
    linkedPayments.forEach(p => tp += p.paidAmount);

    totalAmountAll += b.amount;
    totalSignedAll += ts;
    totalPaidAll += tp;
  });

  const totalRemainingAll = totalAmountAll - totalSignedAll;

  // Render DÒNG TỔNG CỘNG CHUNG
  const trTotal = document.createElement('tr');
  trTotal.style.background = 'rgba(255, 255, 255, 0.05)';
  trTotal.style.fontWeight = 'bold';
  trTotal.style.borderBottom = '2px solid var(--border-glass)';
  trTotal.innerHTML = `
    <td colspan="${isAll ? 3 : 2}" style="text-transform: uppercase;"><strong>TỔNG CỘNG TẤT CẢ</strong></td>
    <td>-</td>
    <td style="text-align: right; font-weight: 700; color: var(--text-main);">${formatVND(totalAmountAll)}</td>
    <td style="text-align: right; font-weight: 700; color: var(--color-primary);">${formatVND(totalSignedAll)}</td>
    <td style="text-align: right; font-weight: 700; color: var(--color-info);">${formatVND(totalPaidAll)}</td>
    <td style="text-align: right; font-weight: 700; color: ${totalRemainingAll < 0 ? 'var(--color-danger)' : 'var(--color-success)'};">
      ${totalRemainingAll < 0 ? 'Vượt ' + formatVND(Math.abs(totalRemainingAll)) : formatVND(totalRemainingAll)}
    </td>
    <td>-</td>
  `;
  tableBody.appendChild(trTotal);

  // Render TỪNG NHÓM CHI PHÍ
  categoriesList.forEach(cat => {
    const catBudgets = budgets.filter(b => b.category === cat.key);
    
    // Nếu không có gói thầu nào trong nhóm này thì có thể bỏ qua hoặc in ra 0
    if (catBudgets.length === 0) return;

    let catTotalAmount = 0;
    let catTotalSigned = 0;
    let catTotalPaid = 0;

    // Tính tổng theo từng budget của nhóm
    const budgetRowsHtml = catBudgets.map(b => {
      const linkedBids = bids.filter(bid => bid.budgetId === b.id);
      const linkedBidIds = linkedBids.map(bid => bid.id);
      const linkedContracts = contracts.filter(c => linkedBidIds.includes(c.bidId) && (c.status === 'active' || c.status === 'liquidated'));
      const linkedContractIds = linkedContracts.map(c => c.id);
      const linkedPayments = payments.filter(p => linkedContractIds.includes(p.contractId) && (p.status === 'paid' || p.status === 'approved'));

      let bSigned = 0, bPaid = 0;
      linkedContracts.forEach(c => bSigned += c.value);
      linkedPayments.forEach(p => bPaid += p.paidAmount);

      catTotalAmount += b.amount;
      catTotalSigned += bSigned;
      catTotalPaid += bPaid;

      const remaining = b.amount - bSigned;
      const isOverBudget = remaining < 0;

      return `
        <tr class="${isOverBudget ? 'row-danger' : ''}">
          <td style="padding-left: 40px;"><strong>${esc(b.code)}</strong></td>
          ${isAll ? `<td class="col-project"><span class="badge badge-secondary">${esc(b.projectName)}</span></td>` : ''}
          <td>${esc(b.name)}</td>
          <td><span style="font-size: 13px; color: var(--text-muted);">${getCategoryName(b.category)}</span></td>
          <td style="text-align: right; font-weight: 500;">${formatVND(b.amount)}</td>
          <td style="text-align: right; font-weight: 500; color: ${bSigned > 0 ? 'var(--color-primary)' : 'inherit'}">${formatVND(bSigned)}</td>
          <td style="text-align: right; font-weight: 500; color: ${bPaid > 0 ? 'var(--color-info)' : 'inherit'}">${formatVND(bPaid)}</td>
          <td style="text-align: right; font-weight: 600;" class="${isOverBudget ? 'cell-danger' : 'cell-success'}">
            ${isOverBudget ? 'Vượt ' + formatVND(Math.abs(remaining)) : formatVND(remaining)}
          </td>
          <td>
            ${isAll ? '-' : `
              <button class="btn btn-secondary btn-sm btn-icon-only edit-budget-btn" data-id="${b.id}"><i data-lucide="edit-2"></i></button>
              <button class="btn btn-danger btn-sm btn-icon-only delete-budget-btn" data-id="${b.id}"><i data-lucide="trash-2"></i></button>
            `}
          </td>
        </tr>
      `;
    }).join('');

    // Dòng Header Nhóm (La Mã)
    const catRemaining = catTotalAmount - catTotalSigned;
    const catTr = document.createElement('tr');
    catTr.style.background = 'rgba(56, 189, 248, 0.15)';
    catTr.style.fontWeight = 'bold';
    catTr.style.fontSize = '15px';
    
    catTr.innerHTML = `
      <td colspan="${isAll ? 3 : 2}" style="padding-left: 24px; color: var(--color-info);"><strong>${esc(cat.name)}</strong></td>
      <td>-</td>
      <td style="text-align: right; font-weight: 700;">${formatVND(catTotalAmount)}</td>
      <td style="text-align: right; font-weight: 700; color: var(--color-primary);">${formatVND(catTotalSigned)}</td>
      <td style="text-align: right; font-weight: 700; color: var(--color-info);">${formatVND(catTotalPaid)}</td>
      <td style="text-align: right; font-weight: 700; color: ${catRemaining < 0 ? 'var(--color-danger)' : 'var(--color-success)'};">
        ${catRemaining < 0 ? 'Vượt ' + formatVND(Math.abs(catRemaining)) : formatVND(catRemaining)}
      </td>
      <td>-</td>
    `;
    
    tableBody.appendChild(catTr);
    
    // Gắn các dòng gói thầu vào sau
    tableBody.insertAdjacentHTML('beforeend', budgetRowsHtml);
  });

  if (!isAll) {
    document.querySelectorAll('.edit-budget-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const bgId = btn.getAttribute('data-id');
        const activeProj = window.db.getProjectById(state.currentProjectId);
        const b = activeProj.budgets.find(item => item.id === bgId);
        if (b) openBudgetModal(b);
      });
    });

    document.querySelectorAll('.delete-budget-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const bgId = btn.getAttribute('data-id');
        if (confirm('Bạn có chắc chắn muốn xóa ngân sách gói thầu này? Mọi thông tin tiến độ gói thầu liên quan cũng sẽ bị xóa.')) {
          window.db.deleteBudget(state.currentProjectId, bgId);
          renderBudgetsTab();
        }
      });
    });
  }

  lucide.createIcons();
}

// 5. Tab Đấu thầu
function renderBidsTab() {
  adjustTableHeadersAndActions('bids-table');

  const isAll = state.currentProjectId === 'all';
  const tableBody = document.querySelector('#bids-table tbody');
  tableBody.innerHTML = '';

  let bids = [];
  let budgets = [];

  const projects = isAll ? window.db.getProjects() : [window.db.getProjectById(state.currentProjectId)].filter(Boolean);

  projects.forEach(p => {
    p.bids.forEach(b => {
      bids.push({ ...b, projectId: p.id, projectName: p.name, originalBudgets: p.budgets });
    });
    p.budgets.forEach(bg => budgets.push(bg));
  });

  if (bids.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="${isAll ? 16 : 15}" style="text-align: center; color: var(--text-dim); padding: 30px 0;">Chưa lập kế hoạch lựa chọn nhà thầu nào.</td></tr>`;
    return;
  }

  bids.forEach(b => {
    const budget = b.originalBudgets ? b.originalBudgets.find(bg => bg.id === b.budgetId) : budgets.find(bg => bg.id === b.budgetId);
    const budgetLink = budget 
      ? `<a href="#" class="tab-link" data-tab="budgets" data-budget-code="${esc(budget.code)}"><strong>${esc(budget.code)}</strong></a> - ${esc(budget.name)} (${formatVND(budget.amount)})` 
      : 'Chưa liên kết';
    
    const bidPlanStart = budget ? (budget.bidPlanStart || '-') : '-';
    const bidPlanEnd = budget ? (budget.bidPlanEnd || '-') : '-';
    const bidActualStart = budget ? (budget.bidActualStart || '-') : '-';
    const bidActualEnd = budget ? (budget.bidActualEnd || '-') : '-';
    const handler = b.handler || '-';

    let delayDays = 0;
    if (budget && budget.bidPlanEnd) {
      const planEnd = new Date(budget.bidPlanEnd);
      planEnd.setHours(0, 0, 0, 0);

      if (b.status === 'awarded' || b.status === 'cancelled') {
        if (budget.bidActualEnd) {
          const actualEnd = new Date(budget.bidActualEnd);
          actualEnd.setHours(0, 0, 0, 0);
          delayDays = Math.max(0, Math.ceil((actualEnd - planEnd) / (1000 * 60 * 60 * 24)));
        }
      } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        delayDays = Math.max(0, Math.ceil((today - planEnd) / (1000 * 60 * 60 * 24)));
      }
    }

    const delayText = delayDays > 0 
      ? `<span style="color: var(--color-danger); font-weight: bold;">${delayDays} ngày</span>` 
      : `<span style="color: var(--color-success);">0 ngày</span>`;

    let diffText = '-';
    let diffClass = '';
    
    if (b.status === 'awarded' && b.bidAmount > 0) {
      const diff = b.estimateAmount - b.bidAmount;
      if (diff >= 0) {
        diffText = `Tiết kiệm ${formatVND(diff)}`;
        diffClass = 'cell-success';
      } else {
        diffText = `Vượt dự toán ${formatVND(Math.abs(diff))}`;
        diffClass = 'cell-danger';
      }
    }

    const tr = document.createElement('tr');
    if (b.status === 'awarded' && b.bidAmount > b.estimateAmount) {
      tr.className = 'row-warning';
    }

    tr.innerHTML = `
      <td><strong>${esc(b.code)}</strong></td>
      ${isAll ? `<td class="col-project"><span class="badge badge-secondary">${esc(b.projectName)}</span></td>` : ''}
      <td>${esc(b.name)}</td>
      <td style="font-size: 13px; color: var(--text-muted);">${budgetLink}</td>
      <td>${bidPlanStart}</td>
      <td>${bidPlanEnd}</td>
      <td>${bidActualStart}</td>
      <td>${bidActualEnd}</td>
      <td>${delayText}</td>
      <td>${handler}</td>
      <td style="text-align: right; font-weight: 500;">${formatVND(b.estimateAmount)}</td>
      <td style="text-align: right; font-weight: 500;">${b.bidAmount > 0 ? formatVND(b.bidAmount) : 'Chưa có'}</td>
      <td>${esc(b.winner || '-')}</td>
      <td class="${diffClass}">${diffText}</td>
      <td>${getStatusBadge('bid', b.status)}</td>
      <td>
        ${isAll ? '-' : `
          <button class="btn btn-secondary btn-sm btn-icon-only edit-bid-btn" data-id="${b.id}"><i data-lucide="edit-2"></i></button>
          <button class="btn btn-danger btn-sm btn-icon-only delete-bid-btn" data-id="${b.id}"><i data-lucide="trash-2"></i></button>
        `}
      </td>
    `;
    tableBody.appendChild(tr);
  });

  if (!isAll) {
    document.querySelectorAll('.edit-bid-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const bidId = btn.getAttribute('data-id');
        const activeProj = window.db.getProjectById(state.currentProjectId);
        const b = activeProj.bids.find(item => item.id === bidId);
        if (b) openBidModal(b);
      });
    });

    document.querySelectorAll('.delete-bid-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const bidId = btn.getAttribute('data-id');
        if (confirm('Bạn có chắc chắn muốn xóa kế hoạch lựa chọn nhà thầu này?')) {
          window.db.deleteBid(state.currentProjectId, bidId);
          renderBidsTab();
        }
      });
    });
  }

  lucide.createIcons();
}

// 6. Tab Hợp đồng & Phụ lục Hợp đồng
function renderContractsTab() {
  adjustTableHeadersAndActions('contracts-table');
  adjustTableHeadersAndActions('addendums-table');

  const isAll = state.currentProjectId === 'all';
  
  // --- 1. RENDER BẢNG HỢP ĐỒNG GỐC ---
  const tableBody = document.querySelector('#contracts-table tbody');
  tableBody.innerHTML = '';

  let contracts = [];
  let addendums = [];
  let payments = [];
  let bids = [];
  let variations = [];

  const projects = isAll ? window.db.getProjects() : [window.db.getProjectById(state.currentProjectId)].filter(Boolean);

  projects.forEach(p => {
    p.contracts.forEach(c => {
      contracts.push({ 
        ...c, 
        projectId: p.id, 
        projectName: p.name, 
        originalAddendums: p.addendums, 
        originalPayments: p.payments,
        originalBids: p.bids
      });
    });
    p.addendums.forEach(a => {
      addendums.push({ 
        ...a, 
        projectId: p.id, 
        projectName: p.name, 
        originalContracts: p.contracts,
        originalVariations: p.variations
      });
    });
    p.payments.forEach(pay => payments.push(pay));
    p.bids.forEach(bid => bids.push(bid));
    p.variations.forEach(v => variations.push(v));
  });

  if (contracts.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="${isAll ? 16 : 15}" style="text-align: center; color: var(--text-dim); padding: 30px 0;">Chưa đăng ký hợp đồng nào.</td></tr>`;
  } else {
    contracts.forEach(c => {
      const activeProjPayments = c.originalPayments || payments;
      const activeProjAddendums = c.originalAddendums || addendums;
      const activeProjBids = c.originalBids || bids;

      const linkedPayments = activeProjPayments.filter(pay => pay.contractId === c.id && pay.status === 'paid');
      let totalDisbursed = 0;
      linkedPayments.forEach(pay => totalDisbursed += pay.paidAmount);

      const baseValue = c.value || 0;
      const addendumsValue = activeProjAddendums
        ? activeProjAddendums.filter(a => a.contractId === c.id && a.status === 'active').reduce((sum, a) => sum + (a.value || 0), 0)
        : 0;
      const totalValue = baseValue + addendumsValue;

      const remainingDisbursement = totalValue - totalDisbursed;
      const disbursementRatio = totalValue > 0 ? (totalDisbursed / totalValue) * 100 : 0;

      const isOverContract = totalDisbursed > totalValue;
      const tr = document.createElement('tr');
      
      if (isOverContract) {
        tr.className = 'row-danger';
      }

      const linkedBid = activeProjBids.find(b => b.id === c.bidId);
      const bidLink = linkedBid 
        ? `<div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Gói thầu: <a href="#" class="tab-link" data-tab="bids" data-bid-id="${c.bidId}">${esc(linkedBid.code)}</a></div>`
        : '';

      tr.innerHTML = `
        <td><strong>${esc(c.code)}</strong></td>
        ${isAll ? `<td class="col-project"><span class="badge badge-secondary">${esc(c.projectName)}</span></td>` : ''}
        <td><strong>${esc(c.name)}</strong>${bidLink}</td>
        <td>${esc(c.signingEntity || '-')}</td>
        <td>${esc(c.partner)}</td>
        <td><span style="font-size: 13px; color: var(--text-muted);">${c.type === 'lump-sum' ? 'Trọn gói' : c.type === 'fixed-unit-price' ? 'Đơn giá cố định' : 'Đơn giá điều chỉnh'}</span></td>
        <td>${c.completionDate || '-'}</td>
        <td style="text-align: right; font-weight: 500;">${formatVND(baseValue)}</td>
        <td style="text-align: right; font-weight: 500; color: var(--color-info);">${formatVND(addendumsValue)}</td>
        <td style="text-align: right; font-weight: 600;">${formatVND(totalValue)}</td>
        <td style="text-align: right; font-weight: 500; color: var(--color-success);">${formatVND(totalDisbursed)}</td>
        <td style="text-align: right; font-weight: 500; color: ${remainingDisbursement < 0 ? 'var(--color-danger)' : 'var(--color-warning)'};">
          ${remainingDisbursement < 0 ? 'Vượt ' + formatVND(Math.abs(remainingDisbursement)) : formatVND(remainingDisbursement)}
        </td>
        <td style="text-align: right; font-weight: 500; color: var(--color-success);">${disbursementRatio.toFixed(1)}%</td>
        <td>${c.signedDate || '-'}</td>
        <td>${getStatusBadge('contract', c.status)}</td>
        <td>
          ${isAll ? '-' : `
            <button class="btn btn-secondary btn-sm btn-icon-only edit-ctr-btn" data-id="${c.id}"><i data-lucide="edit-2"></i></button>
            <button class="btn btn-danger btn-sm btn-icon-only delete-ctr-btn" data-id="${c.id}"><i data-lucide="trash-2"></i></button>
          `}
        </td>
      `;
      tableBody.appendChild(tr);
    });
  }

  // --- 2. RENDER BẢNG PHỤ LỤC HỢP ĐỒNG (PLHĐ) ---
  const addendumsBody = document.querySelector('#addendums-table tbody');
  addendumsBody.innerHTML = '';

  if (addendums.length === 0) {
    addendumsBody.innerHTML = `<tr><td colspan="${isAll ? 9 : 8}" style="text-align: center; color: var(--text-dim); padding: 30px 0;">Chưa lập phụ lục hợp đồng nào.</td></tr>`;
  } else {
    addendums.forEach(a => {
      const activeProjContracts = a.originalContracts || contracts;
      const activeProjVariations = a.originalVariations || variations;

      const parentContract = activeProjContracts.find(c => c.id === a.contractId);
      const contractLink = parentContract 
        ? `<a href="#" class="tab-link" data-tab="contracts" data-contract-id="${a.contractId}"><strong>${esc(parentContract.code)}</strong></a> - ${esc(parentContract.name)}` 
        : 'Không rõ';
      
      let varCodesText = '-';
      if (a.variationIds && a.variationIds.length > 0) {
        const linkedVars = activeProjVariations.filter(v => a.variationIds.includes(v.id));
        varCodesText = linkedVars.map(v => `<a href="#" class="tab-link" data-tab="variations" data-variation-id="${v.id}">${esc(v.code)}</a>`).join(', ');
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${esc(a.code)}</strong></td>
        ${isAll ? `<td class="col-project"><span class="badge badge-secondary">${esc(a.projectName)}</span></td>` : ''}
        <td><strong>${esc(a.name)}</strong></td>
        <td style="font-size: 13px; color: var(--text-muted);">${contractLink}</td>
        <td style="text-align: right; font-weight: 600; color: var(--color-info);">${formatVND(a.value)}</td>
        <td style="font-size: 12px; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${varCodesText}</td>
        <td>${a.signedDate || '-'}</td>
        <td>${a.status === 'active' ? '<span class="badge badge-success">Hiệu lực</span>' : '<span class="badge badge-primary">Soạn thảo</span>'}</td>
        <td>
          ${isAll ? '-' : `
            <button class="btn btn-secondary btn-sm btn-icon-only edit-addendum-btn" data-id="${a.id}"><i data-lucide="edit-2"></i></button>
            <button class="btn btn-danger btn-sm btn-icon-only delete-addendum-btn" data-id="${a.id}"><i data-lucide="trash-2"></i></button>
          `}
        </td>
      `;
      addendumsBody.appendChild(tr);
    });
  }

  if (!isAll) {
    document.querySelectorAll('.edit-ctr-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const ctrId = btn.getAttribute('data-id');
        const activeProj = window.db.getProjectById(state.currentProjectId);
        const c = activeProj.contracts.find(item => item.id === ctrId);
        if (c) openContractModal(c);
      });
    });

    document.querySelectorAll('.delete-ctr-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const ctrId = btn.getAttribute('data-id');
        if (confirm('Bạn có chắc chắn muốn xóa hợp đồng này và toàn bộ lịch sử thanh toán, phụ lục liên quan?')) {
          window.db.deleteContract(state.currentProjectId, ctrId);
          renderContractsTab();
        }
      });
    });

    document.querySelectorAll('.edit-addendum-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const addId = btn.getAttribute('data-id');
        const activeProj = window.db.getProjectById(state.currentProjectId);
        const a = activeProj.addendums.find(item => item.id === addId);
        if (a) openAddendumModal(a);
      });
    });

    document.querySelectorAll('.delete-addendum-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const addId = btn.getAttribute('data-id');
        if (confirm('Bạn có chắc chắn muốn xóa phụ lục hợp đồng này?')) {
          window.db.deleteAddendum(state.currentProjectId, addId);
          renderContractsTab();
        }
      });
    });
  }

  const addAddendumBtn = document.getElementById('btn-add-addendum');
  if (addAddendumBtn) {
    addAddendumBtn.style.display = isAll ? 'none' : '';
  }

  lucide.createIcons();
}

// 6b. Tab Quản lý Phát sinh
function renderVariationsTab() {
  adjustTableHeadersAndActions('variations-table');

  const isAll = state.currentProjectId === 'all';
  const tableBody = document.querySelector('#variations-table tbody');
  if (!tableBody) return;
  tableBody.innerHTML = '';

  let variationsList = [];
  let contracts = [];
  let addendums = [];

  const projects = isAll ? window.db.getProjects() : [window.db.getProjectById(state.currentProjectId)].filter(Boolean);

  projects.forEach(p => {
    p.variations.forEach(v => {
      variationsList.push({ 
        ...v, 
        projectId: p.id, 
        projectName: p.name, 
        originalContracts: p.contracts,
        originalAddendums: p.addendums
      });
    });
    p.contracts.forEach(c => contracts.push(c));
    p.addendums.forEach(a => addendums.push(a));
  });

  const sla = getSlaSettings();
  const limitDays = sla.variation !== undefined ? sla.variation : 7;

  if (variationsList.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="${isAll ? 14 : 13}" style="text-align: center; color: var(--text-dim); padding: 30px 0;">Chưa đăng ký phát sinh chi phí nào.</td></tr>`;
  } else {
    variationsList.forEach(v => {
      const activeProjContracts = v.originalContracts || contracts;
      const activeProjAddendums = v.originalAddendums || addendums;

      const linkedContract = activeProjContracts.find(c => c.id === v.contractId);
      const contractText = linkedContract 
        ? `<a href="#" class="tab-link" data-tab="contracts" data-contract-id="${v.contractId}"><strong>${esc(linkedContract.code)}</strong></a> - ${esc(linkedContract.name)}` 
        : 'Không rõ';
      const partnerText = linkedContract ? linkedContract.partner : '-';
      
      let addendumText = '-';
      if (v.addendumId) {
        const linkedAdd = activeProjAddendums.find(a => a.id === v.addendumId);
        if (linkedAdd) {
          addendumText = `<a href="#" class="tab-link" data-tab="contracts" data-addendum-id="${v.addendumId}" style="color: var(--color-info); font-weight: 500;">${esc(linkedAdd.code)}</a>`;
        }
      }

      // --- TÍNH TOÁN SỐ NGÀY CHẬM THEO SLA ---
      let delayDays = 0;
      let delayText = '-';
      let delayStyle = '';
      
      if (v.receiveDate) {
        const receiveTime = new Date(v.receiveDate).getTime();
        let endTime = Date.now(); // Nếu chưa hoàn thành, tính tới hôm nay
        
        if (v.completeDate) {
          endTime = new Date(v.completeDate).getTime();
        }
        
        const diffTime = endTime - receiveTime;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        delayDays = Math.max(0, diffDays - limitDays);
        
        if (delayDays > 0) {
          delayText = `${delayDays} ngày`;
          delayStyle = 'color: var(--color-danger); font-weight: bold;';
        } else {
          delayText = 'Đúng hạn';
          delayStyle = 'color: var(--color-success); font-weight: 500;';
        }
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${esc(v.code)}</strong></td>
        ${isAll ? `<td class="col-project"><span class="badge badge-secondary">${esc(v.projectName)}</span></td>` : ''}
        <td>${esc(v.name)}</td>
        <td style="font-size: 13px; color: var(--text-muted);">${contractText}</td>
        <td>${partnerText}</td>
        <td>${v.receiveDate || '-'}</td>
        <td>${v.completeDate || '-'}</td>
        <td>${esc(v.handler || '-')}</td>
        <td style="${delayStyle}">${delayText}</td>
        <td style="text-align: right; font-weight: 500;">${formatVND(v.requestAmount)}</td>
        <td style="text-align: right; font-weight: 600; color: ${v.status === 'approved' ? 'var(--color-info)' : 'inherit'}">
          ${v.status === 'approved' ? formatVND(v.approvedAmount) : '-'}
        </td>
        <td>${addendumText}</td>
        <td>${getStatusBadge('payment', v.status)}</td>
        <td>
          ${isAll ? '-' : `
            <button class="btn btn-secondary btn-sm btn-icon-only edit-var-btn" data-id="${v.id}"><i data-lucide="edit-2"></i></button>
            <button class="btn btn-danger btn-sm btn-icon-only delete-var-btn" data-id="${v.id}"><i data-lucide="trash-2"></i></button>
          `}
        </td>
      `;
      tableBody.appendChild(tr);
    });
  }

  if (!isAll) {
    document.querySelectorAll('.edit-var-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const varId = btn.getAttribute('data-id');
        const activeProj = window.db.getProjectById(state.currentProjectId);
        const v = activeProj.variations.find(item => item.id === varId);
        if (v) openVariationModal(v);
      });
    });

    document.querySelectorAll('.delete-var-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const varId = btn.getAttribute('data-id');
        if (confirm('Bạn có chắc chắn muốn xóa phát sinh này?')) {
          window.db.deleteVariation(state.currentProjectId, varId);
          renderVariationsTab();
        }
      });
    });
  }

  lucide.createIcons();
}

// Modal Phát sinh
function openVariationModal(v = null) {
  const form = document.getElementById('form-variation');
  form.reset();

  // Nạp danh sách cán bộ vào select dropdown
  populateOfficerSelects();

  const title = document.getElementById('modal-variation-title');
  const idInput = document.getElementById('form-variation-id');
  const contractSelect = document.getElementById('form-variation-contract');

  const proj = window.db.getProjectById(state.currentProjectId);
  contractSelect.innerHTML = '';

  if (!proj || !proj.contracts || proj.contracts.length === 0) {
    contractSelect.innerHTML = '<option value="">(Chưa đăng ký hợp đồng nào)</option>';
  } else {
    proj.contracts.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.code} - ${c.name} (${c.partner})`;
      contractSelect.appendChild(opt);
    });
  }

  if (v) {
    title.textContent = 'Cập nhật Phát sinh Chi phí';
    idInput.value = v.id;
    contractSelect.value = v.contractId;
    document.getElementById('form-variation-code').value = v.code;
    document.getElementById('form-variation-name').value = v.name;
    document.getElementById('form-variation-request-amount').value = formatVNNumber(v.requestAmount);
    document.getElementById('form-variation-approved-amount').value = formatVNNumber(v.approvedAmount || '');
    document.getElementById('form-variation-status').value = v.status;
    document.getElementById('form-variation-receive-date').value = v.receiveDate || '';
    document.getElementById('form-variation-complete-date').value = v.completeDate || '';
    document.getElementById('form-variation-handler').value = v.handler || '';
  } else {
    title.textContent = 'Đăng ký Phát sinh Chi phí mới';
    idInput.value = '';
    
    // Tự động gán mã phát sinh theo HĐ đầu tiên nếu có
    if (proj && proj.contracts && proj.contracts.length > 0) {
      contractSelect.value = proj.contracts[0].id;
      document.getElementById('form-variation-code').value = proj.contracts[0].code;
    }
    document.getElementById('form-variation-receive-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('form-variation-complete-date').value = '';
    document.getElementById('form-variation-handler').value = '';
  }

  openModal('modal-variation');
}

function submitVariationForm() {
  const id = document.getElementById('form-variation-id').value;
  const variationData = {
    contractId: document.getElementById('form-variation-contract').value,
    code: document.getElementById('form-variation-code').value.trim(),
    name: document.getElementById('form-variation-name').value.trim(),
    requestAmount: parseFloat(parseVNNumber(document.getElementById('form-variation-request-amount').value)) || 0,
    approvedAmount: parseFloat(parseVNNumber(document.getElementById('form-variation-approved-amount').value)) || 0,
    status: document.getElementById('form-variation-status').value,
    receiveDate: document.getElementById('form-variation-receive-date').value,
    completeDate: document.getElementById('form-variation-complete-date').value,
    handler: document.getElementById('form-variation-handler').value
  };

  // Mặc định Ngày nhận hồ sơ là hôm nay nếu trống
  if (!variationData.receiveDate) {
    variationData.receiveDate = new Date().toISOString().split('T')[0];
  }

  // Cán bộ thực hiện và ngày nhận hồ sơ không còn bắt buộc
  if (!variationData.contractId || !variationData.code || !variationData.name || variationData.requestAmount <= 0) {
    alert('Vui lòng nhập đầy đủ thông tin bắt buộc (*): Hợp đồng liên kết, Tên hạng mục phát sinh, Giá trị đề xuất.');
    return;
  }

  if (variationData.status === 'approved' && variationData.approvedAmount <= 0) {
    variationData.approvedAmount = variationData.requestAmount;
  }

  if (id) {
    window.db.updateVariation(state.currentProjectId, id, variationData);
    alert('Cập nhật phát sinh thành công!');
  } else {
    window.db.addVariation(state.currentProjectId, variationData);
    alert('Đăng ký phát sinh thành công!');
  }

  closeModal('modal-variation');
  renderVariationsTab();
}

// Modal Phụ lục Hợp đồng
function openAddendumModal(a = null) {
  const form = document.getElementById('form-addendum');
  form.reset();

  const title = document.getElementById('modal-addendum-title');
  const idInput = document.getElementById('form-addendum-id');
  const contractSelect = document.getElementById('form-addendum-contract');

  const proj = window.db.getProjectById(state.currentProjectId);
  contractSelect.innerHTML = '';

  if (!proj || !proj.contracts || proj.contracts.length === 0) {
    contractSelect.innerHTML = '<option value="">(Chưa đăng ký hợp đồng nào)</option>';
  } else {
    proj.contracts.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.code} - ${c.name} (${c.partner})`;
      contractSelect.appendChild(opt);
    });
  }

  if (a) {
    title.textContent = 'Cập nhật Phụ lục Hợp đồng';
    idInput.value = a.id;
    contractSelect.value = a.contractId;
    document.getElementById('form-addendum-code').value = a.code;
    document.getElementById('form-addendum-name').value = a.name;
    document.getElementById('form-addendum-signed-date').value = a.signedDate || '';
    document.getElementById('form-addendum-status').value = a.status;
    document.getElementById('form-addendum-value').value = formatVNNumber(a.value);

    loadAddendumVariationsSelector(a.contractId, a.variationIds || []);
  } else {
    title.textContent = 'Lập Phụ lục Hợp đồng mới';
    idInput.value = '';
    document.getElementById('form-addendum-status').value = 'active';
    document.getElementById('form-addendum-value').value = formatVNNumber(0);

    if (proj && proj.contracts && proj.contracts.length > 0) {
      contractSelect.value = proj.contracts[0].id;
      document.getElementById('form-addendum-code').value = `PLHĐ-01/${proj.contracts[0].code.split('/')[0]}`;
      loadAddendumVariationsSelector(proj.contracts[0].id, []);
    }
  }

  openModal('modal-addendum');
}

function loadAddendumVariationsSelector(contractId, selectedVarIds = []) {
  const container = document.getElementById('addendum-variations-list');
  if (!container) return;
  container.innerHTML = '';

  const proj = window.db.getProjectById(state.currentProjectId);
  if (!proj) return;

  const allVariations = proj.variations || [];

  // Lọc các phát sinh thuộc hợp đồng này, đã duyệt (approved), và chưa gom (addendumId == null hoặc trùng PLHĐ này)
  const approvedVars = allVariations.filter(v => 
    v.contractId === contractId && 
    v.status === 'approved' && 
    (!v.addendumId || selectedVarIds.includes(v.id))
  );

  if (approvedVars.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted); font-size: 12px; text-align: center; padding: 10px 0;">Không có phát sinh đã duyệt nào cần gom.</p>`;
    return;
  }

  approvedVars.forEach(v => {
    const isChecked = selectedVarIds.includes(v.id) ? 'checked' : '';
    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.gap = '8px';
    div.style.marginBottom = '6px';
    div.innerHTML = `
      <input type="checkbox" id="chk-add-var-${v.id}" class="addendum-var-checkbox" value="${v.id}" data-amount="${v.approvedAmount}" ${isChecked} style="width: 16px; height: 16px; cursor: pointer;">
      <label for="chk-add-var-${v.id}" style="font-size: 12px; cursor: pointer; flex-grow: 1;">
        <strong>${esc(v.code)}</strong>: ${esc(v.name)} (<span style="color: var(--color-info);">${formatVND(v.approvedAmount)}</span>)
      </label>
    `;
    container.appendChild(div);
  });

  // Đăng ký sự kiện thay đổi trên các checkbox vừa tạo
  document.querySelectorAll('.addendum-var-checkbox').forEach(chk => {
    chk.addEventListener('change', () => {
      calculateAddendumValueFromCheckboxes();
    });
  });
}

function calculateAddendumValueFromCheckboxes() {
  let total = 0;
  document.querySelectorAll('.addendum-var-checkbox').forEach(chk => {
    if (chk.checked) {
      total += parseFloat(chk.getAttribute('data-amount')) || 0;
    }
  });
  document.getElementById('form-addendum-value').value = formatVNNumber(total);
}

function submitAddendumForm() {
  const id = document.getElementById('form-addendum-id').value;
  const variationIds = [];
  document.querySelectorAll('.addendum-var-checkbox').forEach(chk => {
    if (chk.checked) {
      variationIds.push(chk.value);
    }
  });

  const addendumData = {
    contractId: document.getElementById('form-addendum-contract').value,
    code: document.getElementById('form-addendum-code').value.trim(),
    name: document.getElementById('form-addendum-name').value.trim(),
    signedDate: document.getElementById('form-addendum-signed-date').value,
    status: document.getElementById('form-addendum-status').value,
    value: parseFloat(parseVNNumber(document.getElementById('form-addendum-value').value)) || 0,
    variationIds: variationIds
  };

  if (!addendumData.contractId || !addendumData.code || !addendumData.name) {
    alert('Vui lòng nhập đầy đủ thông tin bắt buộc (*).');
    return;
  }

  if (id) {
    window.db.updateAddendum(state.currentProjectId, id, addendumData);
    alert('Cập nhật phụ lục hợp đồng thành công!');
  } else {
    window.db.addAddendum(state.currentProjectId, addendumData);
    alert('Lập phụ lục hợp đồng thành công!');
  }

  closeModal('modal-addendum');
  renderContractsTab();
}

// SLA Định mức xử lý hồ sơ
function getSlaSettings() {
  try {
    const saved = localStorage.getItem('antigravity_sla_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.variation === undefined) {
        parsed.variation = 7;
      }
      return parsed;
    }
  } catch (e) {
    console.error("Lỗi đọc SLA settings", e);
  }
  // Mặc định
  return { advance: 1, payment: 7, settlement: 45, variation: 7 };
}

function saveSlaSettings() {
  const advance = parseInt(document.getElementById('sla-advance').value) || 0;
  const payment = parseInt(document.getElementById('sla-payment').value) || 0;
  const settlement = parseInt(document.getElementById('sla-settlement').value) || 0;
  const variation = parseInt(document.getElementById('sla-variation').value) || 0;

  const sla = { advance, payment, settlement, variation };
  localStorage.setItem('antigravity_sla_settings', JSON.stringify(sla));
  alert('Đã cập nhật định mức thời gian xử lý hồ sơ (SLA) thành công!');
  renderPaymentsTab();
}

function initSlaFieldsInUi() {
  const sla = getSlaSettings();
  const advEl = document.getElementById('sla-advance');
  const payEl = document.getElementById('sla-payment');
  const setEl = document.getElementById('sla-settlement');
  const varEl = document.getElementById('sla-variation');
  if (advEl) advEl.value = sla.advance;
  if (payEl) payEl.value = sla.payment;
  if (setEl) setEl.value = sla.settlement;
  if (varEl) varEl.value = sla.variation;
}

function renderPaymentsTab() {
  adjustTableHeadersAndActions('payments-table');

  const isAll = state.currentProjectId === 'all';
  initSlaFieldsInUi();

  const select = document.getElementById('payment-contract-select');
  select.innerHTML = '';

  let contracts = [];
  let addendums = [];
  let payments = [];

  const projects = isAll ? window.db.getProjects() : [window.db.getProjectById(state.currentProjectId)].filter(Boolean);

  projects.forEach(p => {
    p.contracts.forEach(c => {
      contracts.push({ 
        ...c, 
        projectId: p.id, 
        projectName: p.name, 
        originalAddendums: p.addendums, 
        originalPayments: p.payments 
      });
    });
    p.addendums.forEach(a => addendums.push(a));
    p.payments.forEach(pay => {
      payments.push({ ...pay, projectId: p.id, projectName: p.name });
    });
  });

  if (isAll) {
    const optAll = document.createElement('option');
    optAll.value = 'all';
    optAll.textContent = '-- Tất cả hợp đồng --';
    select.appendChild(optAll);
  }

  contracts.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.code} - ${c.name} (${c.partner}) [${c.projectName}]`;
    select.appendChild(opt);
  });

  if (contracts.length === 0 && !isAll) {
    select.innerHTML = '<option value="">(Không có hợp đồng nào)</option>';
    document.getElementById('pay-summary-value').textContent = '0 ₫';
    document.getElementById('pay-summary-paid').textContent = '0 ₫';
    document.getElementById('pay-summary-remain').textContent = '0 ₫';
    document.querySelector('#payments-table tbody').innerHTML = `<tr><td colspan="${isAll ? 23 : 22}" style="text-align: center; color: var(--text-dim); padding: 30px 0;">Vui lòng tạo Hợp đồng trước.</td></tr>`;
    return;
  }

  // Khôi phục giá trị đã chọn
  let activeVal = state.activeContractId;
  if (isAll && !activeVal) {
    activeVal = 'all';
  } else if (!activeVal && contracts.length > 0) {
    activeVal = contracts[0].id;
  }
  
  if (activeVal !== 'all' && !contracts.find(c => c.id === activeVal)) {
    activeVal = isAll ? 'all' : (contracts.length > 0 ? contracts[0].id : '');
  }
  state.activeContractId = activeVal;
  select.value = activeVal;

  let filteredPayments = [];
  let totalValue = 0;
  let totalPaid = 0;

  if (state.activeContractId === 'all') {
    filteredPayments = payments;
    contracts.forEach(c => {
      const baseValue = c.value || 0;
      const addendumsValue = addendums
        .filter(a => a.contractId === c.id && a.status === 'active')
        .reduce((sum, a) => sum + (a.value || 0), 0);
      totalValue += (baseValue + addendumsValue);
    });
    payments.forEach(p => {
      if (p.status === 'paid') totalPaid += p.paidAmount;
    });
  } else {
    const activeCtr = contracts.find(c => c.id === state.activeContractId);
    if (activeCtr) {
      filteredPayments = payments.filter(p => p.contractId === state.activeContractId);
      const baseValue = activeCtr.value || 0;
      const activeProjAddendums = activeCtr.originalAddendums || addendums;
      const addendumsValue = activeProjAddendums
        ? activeProjAddendums.filter(a => a.contractId === activeCtr.id && a.status === 'active').reduce((sum, a) => sum + (a.value || 0), 0)
        : 0;
      totalValue = baseValue + addendumsValue;
      filteredPayments.forEach(p => {
        if (p.status === 'paid') totalPaid += p.paidAmount;
      });
    }
  }

  const remaining = totalValue - totalPaid;

  document.getElementById('pay-summary-value').textContent = formatVND(totalValue);
  document.getElementById('pay-summary-paid').textContent = formatVND(totalPaid);
  document.getElementById('pay-summary-remain').textContent = remaining >= 0 ? formatVND(remaining) : `Vượt HĐ ${formatVND(Math.abs(remaining))}`;
  
  if (remaining < 0) {
    document.getElementById('pay-summary-remain').style.color = 'var(--color-danger)';
  } else {
    document.getElementById('pay-summary-remain').style.color = 'var(--color-warning)';
  }

  const tableBody = document.querySelector('#payments-table tbody');
  tableBody.innerHTML = '';

  if (filteredPayments.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="${isAll ? 23 : 22}" style="text-align: center; color: var(--text-dim); padding: 30px 0;">Chưa có đợt thanh toán nào.</td></tr>`;
    return;
  }

  const sla = getSlaSettings();

  filteredPayments.forEach(p => {
    let typeName = 'Thanh toán';
    if (p.type === 'advance') typeName = 'Tạm ứng';
    else if (p.type === 'settlement') typeName = 'Quyết toán';

    let delayDays = 0;
    let delayText = '-';
    let delayStyle = '';

    if (p.receiveDate) {
      const limitDays = sla[p.type] !== undefined ? sla[p.type] : 7;
      const receiveTime = new Date(p.receiveDate).getTime();
      let endTime = Date.now();

      if (p.completeDate) {
        endTime = new Date(p.completeDate).getTime();
      }

      const diffTime = endTime - receiveTime;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      delayDays = Math.max(0, diffDays - limitDays);
      if (delayDays > 0) {
        delayText = `${delayDays} ngày`;
        delayStyle = 'color: var(--color-danger); font-weight: bold;';
      } else {
        delayText = 'Đúng hạn';
        delayStyle = 'color: var(--color-success); font-weight: 500;';
      }
    }

    const request = p.requestAmount || 0;
    const dedAdvance = p.deductionAdvance || 0;
    const dedMaterial = p.deductionMaterial || 0;
    const dedElec = p.deductionElectricity || 0;
    const dedWater = p.deductionWater || 0;
    const dedPenalty = p.deductionPenalty || 0;
    const dedCross = p.deductionCross || 0;
    const dedOther = p.deductionOther || 0;
    const retention = p.retentionAmount || 0;

    const actualPaidCalculated = request - (dedAdvance + dedMaterial + dedElec + dedWater + dedPenalty + dedCross + dedOther + retention);

    const activeCtr = contracts.find(c => c.id === p.contractId) || { id: '', code: '-', name: '-', signingEntity: '-' };

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${esc(p.period)}</strong></td>
      ${isAll ? `<td class="col-project"><span class="badge badge-secondary">${esc(p.projectName)}</span></td>` : ''}
      <td>${typeName}</td>
      <td><a href="#" class="tab-link" data-tab="contracts" data-contract-id="${activeCtr.id}"><strong>${esc(activeCtr.code)}</strong></a></td>
      <td style="font-size: 13px; color: var(--text-muted);">${esc(activeCtr.signingEntity || '-')}</td>
      <td>${p.receiveDate || '-'}</td>
      <td>${p.completeDate || '-'}</td>
      <td>${p.accountingTransferDate || '-'}</td>
      <td>${esc(p.handler || '-')}</td>
      <td style="${delayStyle}">${delayText}</td>
      <td style="text-align: right; font-weight: 500;">${formatVND(request)}</td>
      <td style="text-align: right; font-weight: 500; color: var(--text-muted);">${p.completedAmount > 0 ? formatVND(p.completedAmount) : '-'}</td>
      <td style="text-align: right; font-weight: 500; color: var(--color-warning);">${dedAdvance > 0 ? formatVND(dedAdvance) : '-'}</td>
      <td style="text-align: right; font-weight: 500; color: var(--color-warning);">${dedMaterial > 0 ? formatVND(dedMaterial) : '-'}</td>
      <td style="text-align: right; font-weight: 500; color: var(--color-warning);">${dedElec > 0 ? formatVND(dedElec) : '-'}</td>
      <td style="text-align: right; font-weight: 500; color: var(--color-warning);">${dedWater > 0 ? formatVND(dedWater) : '-'}</td>
      <td style="text-align: right; font-weight: 500; color: var(--color-danger);">${dedPenalty > 0 ? formatVND(dedPenalty) : '-'}</td>
      <td style="text-align: right; font-weight: 500; color: var(--color-danger);">${dedCross > 0 ? formatVND(dedCross) : '-'}</td>
      <td style="text-align: right; font-weight: 500; color: var(--color-warning);">${dedOther > 0 ? formatVND(dedOther) : '-'}</td>
      <td style="text-align: right; font-weight: 500; color: var(--text-dim);">${retention > 0 ? formatVND(retention) : '-'}</td>
      <td>${p.paidDate || '-'}</td>
      <td>${getStatusBadge('payment', p.status)}</td>
      <td>
        ${(isAll && state.activeContractId === 'all') ? '-' : `
          <button class="btn btn-secondary btn-sm btn-icon-only edit-pay-btn" data-id="${p.id}"><i data-lucide="edit-2"></i></button>
          <button class="btn btn-danger btn-sm btn-icon-only delete-pay-btn" data-id="${p.id}"><i data-lucide="trash-2"></i></button>
        `}
      </td>
    `;
    tableBody.appendChild(tr);
  });

  if (!(isAll && state.activeContractId === 'all')) {
    document.querySelectorAll('.edit-pay-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const payId = btn.getAttribute('data-id');
        const payItem = filteredPayments.find(item => item.id === payId);
        if (payItem) openPaymentModal(payItem, payItem.contractId);
      });
    });

    document.querySelectorAll('.delete-pay-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const payId = btn.getAttribute('data-id');
        if (confirm('Bạn có chắc chắn muốn xóa đợt thanh toán này?')) {
          let targetProjId = state.currentProjectId;
          if (isAll) {
            const payItem = payments.find(item => item.id === payId);
            if (payItem) targetProjId = payItem.projectId;
          }
          window.db.deletePayment(targetProjId, payId);
          renderPaymentsTab();
        }
      });
    });
  }

  lucide.createIcons();
}

// 8. Tab Rủi ro chi phí
function renderRisksTab() {
  const proj = window.db.getProjectById(state.currentProjectId);
  if (!proj) return;

  const tableBody = document.querySelector('#risks-table tbody');
  tableBody.innerHTML = '';

  if (proj.risks.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 30px 0;">Chưa khai báo rủi ro chi phí nào.</td></tr>`;
    return;
  }

  proj.risks.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${esc(r.description)}</strong></td>
      <td><span style="font-weight: 500; color: ${r.probability === 'high' ? 'var(--color-danger)' : r.probability === 'medium' ? 'var(--color-warning)' : 'inherit'}">${r.probability.toUpperCase()}</span></td>
      <td><span style="font-weight: 500; color: ${r.impact === 'high' ? 'var(--color-danger)' : r.impact === 'medium' ? 'var(--color-warning)' : 'inherit'}">${r.impact.toUpperCase()}</span></td>
      <td style="text-align: right; font-weight: 600; color: var(--color-warning);">${formatVND(r.contingencyCost)}</td>
      <td style="font-size: 13px; color: var(--text-muted); max-width: 200px;">${esc(r.mitigation)}</td>
      <td>${getStatusBadge('risk', r.status)}</td>
      <td>
        <button class="btn btn-secondary btn-sm btn-icon-only edit-risk-btn" data-id="${r.id}"><i data-lucide="edit-2"></i></button>
        <button class="btn btn-danger btn-sm btn-icon-only delete-risk-btn" data-id="${r.id}"><i data-lucide="trash-2"></i></button>
      </td>
    `;
    tableBody.appendChild(tr);
  });

  document.querySelectorAll('.edit-risk-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const riskId = btn.getAttribute('data-id');
      const r = proj.risks.find(item => item.id === riskId);
      if (r) openRiskModal(r);
    });
  });

  document.querySelectorAll('.delete-risk-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const riskId = btn.getAttribute('data-id');
      if (confirm('Bạn có chắc chắn muốn xóa rủi ro này?')) {
        window.db.deleteRisk(state.currentProjectId, riskId);
        renderRisksTab();
      }
    });
  });

  lucide.createIcons();
}

// --- POPULATING & SUBMITTING DIALOG FORMS ---

function openModal(modalId) {
  document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

// 1. PROJECT MODAL
function openProjectModal(proj = null) {
  const form = document.getElementById('form-project');
  form.reset();
  
  const title = document.getElementById('modal-project-title');
  const idInput = document.getElementById('form-project-id');
  
  if (proj) {
    title.textContent = 'Chỉnh sửa Dự án';
    idInput.value = proj.id;
    document.getElementById('form-project-name').value = proj.name;
    document.getElementById('form-project-code').value = proj.code || '';
    document.getElementById('form-project-location').value = proj.location;
    document.getElementById('form-project-scale').value = proj.scale;
    document.getElementById('form-project-start').value = proj.startDate || '';
    document.getElementById('form-project-end').value = proj.endDate || '';
    document.getElementById('form-project-status').value = proj.status;
  } else {
    title.textContent = 'Thêm Dự án mới';
    idInput.value = '';
    document.getElementById('form-project-code').value = '';
  }
  
  openModal('modal-project');
}

function submitProjectForm() {
  const id = document.getElementById('form-project-id').value;
  const projectData = {
    name: document.getElementById('form-project-name').value,
    code: document.getElementById('form-project-code').value.trim().toUpperCase(),
    location: document.getElementById('form-project-location').value,
    scale: document.getElementById('form-project-scale').value,
    startDate: document.getElementById('form-project-start').value,
    endDate: document.getElementById('form-project-end').value,
    status: document.getElementById('form-project-status').value
  };

  if (!projectData.name || !projectData.code || !projectData.location || !projectData.scale) {
    alert('Vui lòng nhập đầy đủ các trường thông tin bắt buộc (*).');
    return;
  }

  if (id) {
    window.db.updateProject(id, projectData);
    alert('Cập nhật dự án thành công!');
  } else {
    const newProj = window.db.addProject(projectData);
    state.currentProjectId = newProj.id;
    localStorage.setItem('antigravity_current_project_id', newProj.id);
    alert('Thêm dự án mới thành công!');
  }

  closeModal('modal-project');
  populateProjectSelector();
  document.getElementById('global-project-select').value = state.currentProjectId;
  renderActiveTab();
}

// 2. TMĐT MATRIX MODAL (Nâng cấp)
function openTmdtCategoriesModal(tmdt) {
  // Mặc định chọn Thiết kế cơ sở để điền ban đầu
  document.getElementById('form-tmdt-stage-select').value = 'design';
  fillTmdtCategoryInputs(tmdt, 'design');
  openModal('modal-tmdt-categories');
}

function fillTmdtCategoryInputs(tmdt, stage) {
  const categoriesList = ['gpmb', 'construction', 'equipment', 'qlda', 'consulting', 'other', 'contingency'];
  let total = 0;

  categoriesList.forEach(c => {
    const val = (tmdt[c] && tmdt[c][stage]) ? tmdt[c][stage] : 0;
    const input = document.getElementById(`form-cat-${c}`);
    input.value = val;
    total += val;

    // Kiểm soát thuộc tính readonly và style theo trạng thái khóa liên kết
    if (stage === 'design') {
      input.removeAttribute('readonly');
      input.style.opacity = '1';
      input.style.cursor = 'auto';
    } else {
      if (c === 'contingency') {
        input.removeAttribute('readonly');
        input.style.opacity = '1';
        input.style.cursor = 'auto';
      } else {
        input.setAttribute('readonly', 'true');
        input.style.opacity = '0.6';
        input.style.cursor = 'not-allowed';
      }
    }
  });

  // Hiển thị hoặc ẩn thông báo khóa
  const notice = document.getElementById('tmdt-lock-notice');
  if (notice) {
    notice.style.display = (stage === 'design') ? 'none' : 'block';
  }

  document.getElementById('modal-tmdt-cat-total').textContent = formatVND(total);
}

function submitTmdtCategoriesForm() {
  const proj = window.db.getProjectById(state.currentProjectId);
  if (proj) {
    const stage = document.getElementById('form-tmdt-stage-select').value;
    const categoriesList = ['gpmb', 'construction', 'equipment', 'qlda', 'consulting', 'other', 'contingency'];
    
    // Sao chép sâu đối tượng tmdt hiện tại
    const newTmdt = JSON.parse(JSON.stringify(proj.tmdt));

    categoriesList.forEach(c => {
      if (!newTmdt[c]) {
        newTmdt[c] = { design: 0, approved: 0, adjusted: 0 };
      }
      // Chỉ lưu các trường không bị khóa (giai đoạn design, hoặc hạng mục là contingency)
      if (stage === 'design' || c === 'contingency') {
        newTmdt[c][stage] = parseFloat(parseVNNumber(document.getElementById(`form-cat-${c}`).value)) || 0;
      }
    });

    window.db.updateProjectTMDT(state.currentProjectId, newTmdt);

    alert(`Cập nhật cơ cấu TMĐT giai đoạn "${document.getElementById('form-tmdt-stage-select').selectedOptions[0].text}" thành công!`);
    closeModal('modal-tmdt-categories');
    renderActiveTab();
  }
}

// 3. BUDGET MODAL (NGÂN SÁCH GÓI THẦU)
function openBudgetModal(b = null) {
  const form = document.getElementById('form-budget');
  form.reset();
  
  const title = document.getElementById('modal-budget-title');
  const idInput = document.getElementById('form-budget-id');
  const catSelect = document.getElementById('form-budget-category');
  const codeInput = document.getElementById('form-budget-code');

  // Reset dynamically bound listener
  catSelect.onchange = null;

  if (b) {
    title.textContent = 'Sửa Ngân sách gói thầu';
    idInput.value = b.id;
    codeInput.value = b.code;
    document.getElementById('form-budget-name').value = b.name;
    catSelect.value = b.category;
    document.getElementById('form-budget-amount').value = formatVNNumber(b.amount);
  } else {
    title.textContent = 'Thêm Ngân sách gói thầu';
    idInput.value = '';

    const proj = window.db.getProjectById(state.currentProjectId);
    if (proj) {
      const projCode = (proj.code || '').trim().toUpperCase() || 'DA';
      const updateSuggestedCode = () => {
        let catCode = 'K';
        const cat = catSelect.value;
        if (cat === 'gpmb') catCode = 'MB';
        else if (cat === 'construction') catCode = 'XD';
        else if (cat === 'equipment') catCode = 'TB';
        else if (cat === 'qlda') catCode = 'QL';
        else if (cat === 'consulting') catCode = 'TV';
        codeInput.value = `${projCode}-${catCode}`;
      };
      
      catSelect.onchange = updateSuggestedCode;
      updateSuggestedCode();
    }
  }

  openModal('modal-budget');
}

function submitBudgetForm() {
  const id = document.getElementById('form-budget-id').value;
  const budgetData = {
    code: document.getElementById('form-budget-code').value,
    name: document.getElementById('form-budget-name').value,
    category: document.getElementById('form-budget-category').value,
    amount: parseFloat(parseVNNumber(document.getElementById('form-budget-amount').value)) || 0
  };

  if (!budgetData.code || !budgetData.name || !budgetData.category || budgetData.amount <= 0) {
    alert('Vui lòng điền đầy đủ các thông tin bắt buộc (*).');
    return;
  }

  const proj = window.db.getProjectById(state.currentProjectId);
  
  // Lấy giá trị TMĐT phê duyệt tương ứng
  const maxAllowedForCat = proj.tmdt[budgetData.category] ? (proj.tmdt[budgetData.category].approved || 0) : 0;
  
  let totalOtherBudgetsOfCat = 0;
  proj.budgets.forEach(b => {
    if (b.category === budgetData.category && b.id !== id) {
      totalOtherBudgetsOfCat += b.amount;
    }
  });

  if (totalOtherBudgetsOfCat + budgetData.amount > maxAllowedForCat) {
    if (!confirm(`Cảnh báo: Tổng ngân sách gói thầu cho cấu phần này (${formatVND(totalOtherBudgetsOfCat + budgetData.amount)}) sẽ vượt chi phí TMĐT Phê duyệt tương ứng (${formatVND(maxAllowedForCat)}). Bạn có tiếp tục lưu?`)) {
      return;
    }
  }

  if (id) {
    window.db.updateBudget(state.currentProjectId, id, budgetData);
    alert('Cập nhật ngân sách thành công!');
  } else {
    window.db.addBudget(state.currentProjectId, budgetData);
    alert('Thêm ngân sách thành công!');
  }

  closeModal('modal-budget');
  renderActiveTab();
}

// --- 4. CẬP NHẬT TIẾN ĐỘ WBS DÙNG CHUNG ---
function renderWbsSchedule(proj) {
  const tableBody = document.querySelector('#wbs-schedule-table tbody');
  if (!tableBody) return;
  tableBody.innerHTML = '';

  const msA = proj.milestones.find(m => m.id === 'ms-A') || { name: 'A. Tiến độ đền bù GPMB', planStart: '', planEnd: '', actualStart: '', actualEnd: '', progress: 0, status: 'pending' };
  const msB = proj.milestones.find(m => m.id === 'ms-B') || { name: 'B. Lập báo cáo nghiên cứu khả thi/TMĐT/HQDA', planStart: '', planEnd: '', actualStart: '', actualEnd: '', progress: 0, status: 'pending' };
  const msC = proj.milestones.find(m => m.id === 'ms-C') || { name: 'C. Thiết kế kỹ thuật, thiết kế bản vẽ thi công', planStart: '', planEnd: '', actualStart: '', actualEnd: '', progress: 0, status: 'pending' };

  // A. Tiến độ đền bù GPMB
  createWbsRow(msA.name, msA.planStart, msA.planEnd, msA.actualStart, msA.actualEnd, msA.progress, msA.status, 'milestone', 'ms-A', false);
  // B. Lập báo cáo nghiên cứu khả thi
  createWbsRow(msB.name, msB.planStart, msB.planEnd, msB.actualStart, msB.actualEnd, msB.progress, msB.status, 'milestone', 'ms-B', false);
  // C. Thiết kế kỹ thuật
  createWbsRow(msC.name, msC.planStart, msC.planEnd, msC.actualStart, msC.actualEnd, msC.progress, msC.status, 'milestone', 'ms-C', false);

  // D. Lựa chọn Nhà thầu thi công
  const avgBidProgress = proj.budgets.length > 0 ? Math.round(proj.budgets.reduce((acc, b) => acc + (b.bidProgress || 0), 0) / proj.budgets.length) : 0;
  let bidStatusText = 'pending';
  if (avgBidProgress === 100) bidStatusText = 'completed';
  else if (avgBidProgress > 0) bidStatusText = 'on-track';
  createWbsRow('D. Lựa chọn Nhà thầu thi công', '', '', '', '', avgBidProgress, bidStatusText, 'header-procurement', 'hdr-D', true);

  // Các gói con của D
  proj.budgets.forEach((b, idx) => {
    let statusText = 'pending';
    const progress = b.bidProgress || 0;
    if (progress === 100) {
      statusText = 'completed';
    } else if (progress > 0) {
      const today = new Date();
      const endDay = b.bidPlanEnd ? new Date(b.bidPlanEnd) : null;
      if (endDay && today > endDay) {
        statusText = 'delayed';
      } else {
        statusText = 'on-track';
      }
    } else if (progress === 0 && b.bidPlanStart) {
      const today = new Date();
      const startDay = new Date(b.bidPlanStart);
      if (today > startDay) {
        statusText = 'delayed';
      }
    }
    
    createWbsRow(`&nbsp;&nbsp;&nbsp;&nbsp;${idx + 1}. Gói ${esc(b.code)}: ${esc(b.name)}`, b.bidPlanStart, b.bidPlanEnd, b.bidActualStart, b.bidActualEnd, progress, statusText, 'procurement', b.id, false);
  });

  // E. Tiến độ thi công
  const avgConstProgress = proj.budgets.length > 0 ? Math.round(proj.budgets.reduce((acc, b) => acc + (b.progress || 0), 0) / proj.budgets.length) : 0;
  let constStatusText = 'pending';
  if (avgConstProgress === 100) constStatusText = 'completed';
  else if (avgConstProgress > 0) constStatusText = 'on-track';
  createWbsRow('E. Tiến độ thi công', '', '', '', '', avgConstProgress, constStatusText, 'header-construction', 'hdr-E', true);

  // Các gói con của E
  proj.budgets.forEach((b, idx) => {
    let statusText = 'pending';
    const progress = b.progress || 0;
    if (progress === 100) {
      statusText = 'completed';
    } else if (progress > 0) {
      const today = new Date();
      const endDay = b.planEnd ? new Date(b.planEnd) : null;
      if (endDay && today > endDay) {
        statusText = 'delayed';
      } else {
        statusText = 'on-track';
      }
    } else if (progress === 0 && b.planStart) {
      const today = new Date();
      const startDay = new Date(b.planStart);
      if (today > startDay) {
        statusText = 'delayed';
      }
    }
    
    createWbsRow(`&nbsp;&nbsp;&nbsp;&nbsp;${idx + 1}. Gói ${esc(b.code)}: ${esc(b.name)}`, b.planStart, b.planEnd, b.actualStart, b.actualEnd, progress, statusText, 'construction', b.id, false);
  });

  // Sự kiện nút sửa WBS
  document.querySelectorAll('.edit-wbs-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-type');
      const targetId = btn.getAttribute('data-id');
      openWbsScheduleModal(type, targetId);
    });
  });

  function createWbsRow(name, planStart, planEnd, actualStart, actualEnd, progress, status, type, id, isHeader = false) {
    const tr = document.createElement('tr');
    if (isHeader) {
      tr.style.background = 'rgba(255, 255, 255, 0.015)';
      tr.style.fontWeight = 'bold';
    }

    const pStart = isHeader ? '' : (planStart || '-');
    const pEnd = isHeader ? '' : (planEnd || '-');
    const aStart = isHeader ? '' : (actualStart || '-');
    const aEnd = isHeader ? '' : (actualEnd || '-');

    tr.innerHTML = `
      <td><span class="${isHeader ? 'wbs-header-text' : 'wbs-child-text'}">${name}</span></td>
      <td style="font-size: 12px; color: var(--text-muted);">${pStart}</td>
      <td style="font-size: 12px; color: var(--text-muted);">${pEnd}</td>
      <td style="font-size: 12px; color: var(--text-muted);">${aStart}</td>
      <td style="font-size: 12px; color: var(--text-muted);">${aEnd}</td>
      <td>
        <div class="progress-bar-wrapper">
          <div class="progress-track" style="height: 4px;">
            <div class="progress-fill" style="width: ${progress}%"></div>
          </div>
          <span style="font-size: 11px; font-weight: 500;">${progress}%</span>
        </div>
      </td>
      <td>${getStatusBadge('milestone', status)}</td>
      <td style="text-align: center;">
        ${isHeader ? '-' : `<button class="btn btn-secondary btn-sm btn-icon-only edit-wbs-btn" data-type="${type}" data-id="${id}" title="Cập nhật tiến độ"><i data-lucide="edit-2"></i></button>`}
      </td>
    `;
    tableBody.appendChild(tr);
  }
}

function openWbsScheduleModal(type, targetId) {
  const proj = window.db.getProjectById(state.currentProjectId);
  if (!proj) return;

  const form = document.getElementById('form-wbs-schedule-update');
  form.reset();

  document.getElementById('form-wbs-type').value = type;
  document.getElementById('form-wbs-target-id').value = targetId;

  let name = '';
  let planStart = '';
  let planEnd = '';
  let actualStart = '';
  let actualEnd = '';
  let progress = 0;
  let status = 'pending';

  if (type === 'milestone') {
    const m = proj.milestones.find(item => item.id === targetId);
    if (m) {
      name = m.name;
      planStart = m.planStart || '';
      planEnd = m.planEnd || '';
      actualStart = m.actualStart || '';
      actualEnd = m.actualEnd || '';
      progress = m.progress || 0;
      status = m.status || 'pending';
    }
  } else if (type === 'procurement') {
    const b = proj.budgets.find(item => item.id === targetId);
    if (b) {
      name = `D. Lựa chọn Nhà thầu - Gói ${esc(b.code)}: ${esc(b.name)}`;
      planStart = b.bidPlanStart || '';
      planEnd = b.bidPlanEnd || '';
      actualStart = b.bidActualStart || '';
      actualEnd = b.bidActualEnd || '';
      progress = b.bidProgress || 0;
      
      status = 'pending';
      if (progress === 100) status = 'completed';
      else if (progress > 0) status = 'on-track';
    }
  } else if (type === 'construction') {
    const b = proj.budgets.find(item => item.id === targetId);
    if (b) {
      name = `E. Thi công - Gói ${esc(b.code)}: ${esc(b.name)}`;
      planStart = b.planStart || '';
      planEnd = b.planEnd || '';
      actualStart = b.actualStart || '';
      actualEnd = b.actualEnd || '';
      progress = b.progress || 0;
      
      status = 'pending';
      if (progress === 100) status = 'completed';
      else if (progress > 0) status = 'on-track';
    }
  }

  document.getElementById('form-wbs-task-name').innerHTML = name;
  document.getElementById('form-wbs-plan-start').value = planStart;
  document.getElementById('form-wbs-plan-end').value = planEnd;
  document.getElementById('form-wbs-actual-start').value = actualStart;
  document.getElementById('form-wbs-actual-end').value = actualEnd;
  document.getElementById('form-wbs-progress').value = formatVNNumber(progress);
  document.getElementById('form-wbs-status').value = status;

  openModal('modal-wbs-schedule-update');
}

function submitWbsScheduleForm() {
  const type = document.getElementById('form-wbs-type').value;
  const targetId = document.getElementById('form-wbs-target-id').value;

  const planStart = document.getElementById('form-wbs-plan-start').value;
  const planEnd = document.getElementById('form-wbs-plan-end').value;
  const actualStart = document.getElementById('form-wbs-actual-start').value;
  const actualEnd = document.getElementById('form-wbs-actual-end').value;
  const progress = parseInt(parseVNNumber(document.getElementById('form-wbs-progress').value)) || 0;
  let status = document.getElementById('form-wbs-status').value;

  if (!planStart || !planEnd) {
    alert('Vui lòng nhập ngày bắt đầu và kết thúc kế hoạch (*).');
    return;
  }

  if (progress === 100) {
    status = 'completed';
    if (!actualEnd) {
      document.getElementById('form-wbs-actual-end').value = new Date().toISOString().split('T')[0];
    }
  }

  if (type === 'milestone') {
    window.db.updateMilestone(state.currentProjectId, targetId, {
      planStart, planEnd, actualStart, actualEnd, progress, status
    });
  } else if (type === 'procurement') {
    window.db.updateBudget(state.currentProjectId, targetId, {
      bidPlanStart: planStart,
      bidPlanEnd: planEnd,
      bidActualStart: actualStart,
      bidActualEnd: actualEnd,
      bidProgress: progress
    });
  } else if (type === 'construction') {
    window.db.updateBudget(state.currentProjectId, targetId, {
      planStart,
      planEnd,
      actualStart,
      actualEnd,
      progress
    });
  }

  alert('Cập nhật tiến độ WBS thành công!');
  closeModal('modal-wbs-schedule-update');
  renderProjectsTab();
}

// 5. BID MODAL (ĐẤU THẦU)
function openBidModal(b = null) {
  const form = document.getElementById('form-bid');
  form.reset();
  
  // Nạp danh sách cán bộ vào select dropdown
  populateOfficerSelects();
  
  const title = document.getElementById('modal-bid-title');
  const idInput = document.getElementById('form-bid-id');
  const budgetSelect = document.getElementById('form-bid-budget');
  
  const proj = window.db.getProjectById(state.currentProjectId);
  budgetSelect.innerHTML = '';
  
  if (proj.budgets.length === 0) {
    budgetSelect.innerHTML = '<option value="">(Chưa phân bổ ngân sách thầu)</option>';
  } else {
    proj.budgets.forEach(bg => {
      const opt = document.createElement('option');
      opt.value = bg.id;
      opt.textContent = `${bg.code} - ${bg.name} (${formatVND(bg.amount)})`;
      budgetSelect.appendChild(opt);
    });
  }

  if (b) {
    title.textContent = 'Sửa Kế hoạch lựa chọn nhà thầu';
    idInput.value = b.id;
    budgetSelect.value = b.budgetId;
    
    // Tìm budget tương ứng để thiết lập Tiền tố và Hậu tố
    const bg = proj.budgets.find(item => item.id === b.budgetId);
    if (bg) {
      document.getElementById('form-bid-code-prefix').value = bg.code;
      if (b.code === bg.code) {
        document.getElementById('form-bid-code-suffix').value = ''; // Trùng khít, hậu tố trống
      } else if (b.code.startsWith(bg.code + '-')) {
        document.getElementById('form-bid-code-suffix').value = b.code.replace(bg.code + '-', '');
      } else {
        document.getElementById('form-bid-code-suffix').value = b.code; // Fallback
      }
    } else {
      document.getElementById('form-bid-code-prefix').value = '';
      document.getElementById('form-bid-code-suffix').value = b.code;
    }
    
    document.getElementById('form-bid-code').value = b.code;
    document.getElementById('form-bid-name').value = b.name;
    document.getElementById('form-bid-estimate').value = formatVNNumber(b.estimateAmount);
    document.getElementById('form-bid-amount').value = formatVNNumber(b.bidAmount || '');
    document.getElementById('form-bid-winner').value = b.winner || '';
    document.getElementById('form-bid-handler').value = b.handler || '';
    document.getElementById('form-bid-status').value = b.status;
  } else {
    title.textContent = 'Thêm Kế hoạch lựa chọn nhà thầu';
    idInput.value = '';
    
    if (proj.budgets.length > 0) {
      const firstBg = proj.budgets[0];
      budgetSelect.value = firstBg.id;
      document.getElementById('form-bid-code-prefix').value = firstBg.code;
      
      // Gợi ý số thứ tự tiếp theo
      const matchingBids = proj.bids.filter(b => b.budgetId === firstBg.id);
      const count = matchingBids.length + 1;
      const countStr = count < 10 ? '0' + count : count;
      document.getElementById('form-bid-code-suffix').value = countStr;

      document.getElementById('form-bid-name').value = 'Gói thầu: ' + firstBg.name.replace('Hạng mục: ', '');
    } else {
      document.getElementById('form-bid-code-prefix').value = '';
      document.getElementById('form-bid-code-suffix').value = '';
    }
    document.getElementById('form-bid-handler').value = '';
    document.getElementById('form-bid-code').value = '';
  }

  openModal('modal-bid');
}

function submitBidForm() {
  const id = document.getElementById('form-bid-id').value;
  const prefix = document.getElementById('form-bid-code-prefix').value;
  const suffix = document.getElementById('form-bid-code-suffix').value.trim();

  if (!prefix) {
    alert('Vui lòng chọn ngân sách thầu.');
    return;
  }

  // Ghép mã đầy đủ:
  // Nếu có suffix: prefix + "-" + suffix
  // Nếu không có suffix: prefix
  const bidCode = suffix ? `${prefix}-${suffix}` : prefix;

  // Kiểm tra trùng lặp mã gói thầu trong dự án hiện tại
  const proj = window.db.getProjectById(state.currentProjectId);
  if (proj) {
    const isDuplicate = proj.bids.some(bid => bid.code === bidCode && bid.id !== id);
    if (isDuplicate) {
      alert(`Mã gói thầu "${bidCode}" đã tồn tại trong hệ thống. Vui lòng nhập mã hậu tố khác.`);
      return;
    }
  }

  const bidData = {
    budgetId: document.getElementById('form-bid-budget').value,
    code: bidCode,
    name: document.getElementById('form-bid-name').value,
    estimateAmount: parseFloat(parseVNNumber(document.getElementById('form-bid-estimate').value)) || 0,
    bidAmount: parseFloat(parseVNNumber(document.getElementById('form-bid-amount').value)) || 0,
    winner: document.getElementById('form-bid-winner').value,
    handler: document.getElementById('form-bid-handler').value.trim(),
    status: document.getElementById('form-bid-status').value
  };

  if (!bidData.budgetId || !bidData.code || !bidData.name || bidData.estimateAmount <= 0 || !bidData.handler) {
    alert('Vui lòng nhập thông tin đầy đủ, bao gồm cả cán bộ thực hiện (*).');
    return;
  }

  if (bidData.bidAmount > 0 && bidData.winner !== '' && bidData.status !== 'cancelled') {
    bidData.status = 'awarded';
  }

  if (id) {
    window.db.updateBid(state.currentProjectId, id, bidData);
    alert('Cập nhật kế hoạch thầu thành công!');
  } else {
    window.db.addBid(state.currentProjectId, bidData);
    alert('Thêm kế hoạch thầu thành công!');
  }

  closeModal('modal-bid');
  renderBidsTab();
}

// 6. CONTRACT MODAL (HỢP ĐỒNG)
function openContractModal(c = null) {
  const form = document.getElementById('form-contract');
  form.reset();
  
  const title = document.getElementById('modal-contract-title');
  const idInput = document.getElementById('form-contract-id');
  const bidSelect = document.getElementById('form-contract-bid');
  
  const proj = window.db.getProjectById(state.currentProjectId);
  bidSelect.innerHTML = '';
  
  const awardedBids = proj.bids.filter(b => b.status === 'awarded');
  if (awardedBids.length === 0) {
    bidSelect.innerHTML = '<option value="">(Chưa phê duyệt kết quả thầu nào để ký hợp đồng)</option>';
  } else {
    awardedBids.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = `${b.code} - ${b.winner} (${formatVND(b.bidAmount)})`;
      bidSelect.appendChild(opt);
    });
  }

  if (c) {
    title.textContent = 'Chỉnh sửa Hợp đồng';
    idInput.value = c.id;
    bidSelect.value = c.bidId;
    document.getElementById('form-contract-code').value = c.code;
    document.getElementById('form-contract-name').value = c.name;
    document.getElementById('form-contract-partner').value = c.partner;
    document.getElementById('form-contract-value').value = formatVNNumber(c.value);
    document.getElementById('form-contract-type').value = c.type;
    document.getElementById('form-contract-signing-entity').value = c.signingEntity || '';
    document.getElementById('form-contract-completion-date').value = c.completionDate || '';
    document.getElementById('form-contract-signed').value = c.signedDate || '';
    document.getElementById('form-contract-status').value = c.status;
  } else {
    title.textContent = 'Đăng ký Hợp đồng mới';
    idInput.value = '';
    
    // Kích hoạt điền nhanh
    bidSelect.addEventListener('change', (e) => {
      const selectedBid = awardedBids.find(b => b.id === e.target.value);
      if (selectedBid) {
        document.getElementById('form-contract-partner').value = selectedBid.winner;
        document.getElementById('form-contract-value').value = formatVNNumber(selectedBid.bidAmount);
        document.getElementById('form-contract-name').value = 'Hợp đồng gói: ' + selectedBid.name.replace('Gói thầu: ', '');
        document.getElementById('form-contract-code').value = selectedBid.code;
      }
    });
    
    if (awardedBids.length > 0) {
      document.getElementById('form-contract-partner').value = awardedBids[0].winner;
      document.getElementById('form-contract-value').value = formatVNNumber(awardedBids[0].bidAmount);
      document.getElementById('form-contract-name').value = 'Hợp đồng gói: ' + awardedBids[0].name.replace('Gói thầu: ', '');
      document.getElementById('form-contract-code').value = awardedBids[0].code;
    }
    document.getElementById('form-contract-signing-entity').value = '';
    document.getElementById('form-contract-completion-date').value = '';
  }

  openModal('modal-contract');
}

function submitContractForm() {
  const id = document.getElementById('form-contract-id').value;
  const contractData = {
    bidId: document.getElementById('form-contract-bid').value,
    code: document.getElementById('form-contract-code').value,
    name: document.getElementById('form-contract-name').value,
    partner: document.getElementById('form-contract-partner').value,
    value: parseFloat(parseVNNumber(document.getElementById('form-contract-value').value)) || 0,
    type: document.getElementById('form-contract-type').value,
    signingEntity: document.getElementById('form-contract-signing-entity').value.trim(),
    completionDate: document.getElementById('form-contract-completion-date').value,
    signedDate: document.getElementById('form-contract-signed').value,
    status: document.getElementById('form-contract-status').value
  };

  if (!contractData.bidId || !contractData.code || !contractData.name || contractData.value <= 0 || !contractData.signingEntity || !contractData.completionDate) {
    alert('Vui lòng chọn kết quả trúng thầu và điền đầy đủ thông tin hợp đồng bao gồm Pháp nhân và Ngày hoàn thành (*).');
    return;
  }

  if (id) {
    window.db.updateContract(state.currentProjectId, id, contractData);
    alert('Cập nhật hợp đồng thành công!');
  } else {
    window.db.addContract(state.currentProjectId, contractData);
    alert('Đăng ký hợp đồng thành công!');
  }

  closeModal('modal-contract');
  renderContractsTab();
}

// 5. PAYMENT MODAL
function calculateActualPaidInModal() {
  const request = parseFloat(parseVNNumber(document.getElementById('form-payment-request').value)) || 0;
  const dedAdvance = parseFloat(parseVNNumber(document.getElementById('form-payment-deduction-advance').value)) || 0;
  const dedMaterial = parseFloat(parseVNNumber(document.getElementById('form-payment-deduction-material').value)) || 0;
  const dedElec = parseFloat(parseVNNumber(document.getElementById('form-payment-deduction-electricity').value)) || 0;
  const dedWater = parseFloat(parseVNNumber(document.getElementById('form-payment-deduction-water').value)) || 0;
  const dedPenalty = parseFloat(parseVNNumber(document.getElementById('form-payment-deduction-penalty').value)) || 0;
  const dedCross = parseFloat(parseVNNumber(document.getElementById('form-payment-deduction-cross').value)) || 0;
  const dedOther = parseFloat(parseVNNumber(document.getElementById('form-payment-deduction-other').value)) || 0;
  const retention = parseFloat(parseVNNumber(document.getElementById('form-payment-retention').value)) || 0;
  
  const paid = request; // Giá trị giải ngân thanh toán chính là bằng giá trị đề nghị thanh toán
  document.getElementById('form-payment-paid').value = formatVNNumber(paid);
}

function openPaymentModal(p = null, contractId) {
  const form = document.getElementById('form-payment');
  form.reset();
  
  // Nạp danh sách cán bộ vào select dropdown
  populateOfficerSelects();
  
  const title = document.getElementById('modal-payment-title');
  const idInput = document.getElementById('form-payment-id');
  document.getElementById('form-payment-contract-id').value = contractId;

  if (p) {
    title.textContent = 'Sửa Nhật ký thanh toán';
    idInput.value = p.id;
    document.getElementById('form-payment-period').value = p.period;
    document.getElementById('form-payment-type').value = p.type;
    document.getElementById('form-payment-status').value = p.status;
    
    document.getElementById('form-payment-receive-date').value = p.receiveDate || '';
    document.getElementById('form-payment-complete-date').value = p.completeDate || '';
    document.getElementById('form-payment-accounting-transfer-date').value = p.accountingTransferDate || '';
    document.getElementById('form-payment-handler').value = p.handler || '';
    
    document.getElementById('form-payment-completed-amount').value = formatVNNumber(p.completedAmount || '');
    document.getElementById('form-payment-request').value = formatVNNumber(p.requestAmount || 0);
    
    document.getElementById('form-payment-deduction-advance').value = formatVNNumber(p.deductionAdvance || 0);
    document.getElementById('form-payment-deduction-material').value = formatVNNumber(p.deductionMaterial || 0);
    document.getElementById('form-payment-deduction-electricity').value = formatVNNumber(p.deductionElectricity || 0);
    document.getElementById('form-payment-deduction-water').value = formatVNNumber(p.deductionWater || 0);
    document.getElementById('form-payment-deduction-penalty').value = formatVNNumber(p.deductionPenalty || 0);
    document.getElementById('form-payment-deduction-cross').value = formatVNNumber(p.deductionCross || 0);
    document.getElementById('form-payment-deduction-other').value = formatVNNumber(p.deductionOther || 0);
    document.getElementById('form-payment-retention').value = formatVNNumber(p.retentionAmount || 0);
    
    document.getElementById('form-payment-paid').value = formatVNNumber(p.paidAmount || 0);
    document.getElementById('form-payment-date').value = p.paidDate || '';
  } else {
    title.textContent = 'Lập Đề nghị thanh toán';
    idInput.value = '';
    document.getElementById('form-payment-status').value = 'pending';
    document.getElementById('form-payment-type').value = 'payment';
    document.getElementById('form-payment-receive-date').value = new Date().toISOString().split('T')[0];
    
    document.getElementById('form-payment-completed-amount').value = '';
    document.getElementById('form-payment-request').value = '';
    document.getElementById('form-payment-deduction-advance').value = formatVNNumber(0);
    document.getElementById('form-payment-deduction-material').value = formatVNNumber(0);
    document.getElementById('form-payment-deduction-electricity').value = formatVNNumber(0);
    document.getElementById('form-payment-deduction-water').value = formatVNNumber(0);
    document.getElementById('form-payment-deduction-penalty').value = formatVNNumber(0);
    document.getElementById('form-payment-deduction-cross').value = formatVNNumber(0);
    document.getElementById('form-payment-deduction-other').value = formatVNNumber(0);
    document.getElementById('form-payment-retention').value = formatVNNumber(0);
    document.getElementById('form-payment-paid').value = formatVNNumber(0);
    document.getElementById('form-payment-date').value = '';
    document.getElementById('form-payment-handler').value = '';
  }

  openModal('modal-payment');
}

function submitPaymentForm() {
  const id = document.getElementById('form-payment-id').value;
  const contractId = document.getElementById('form-payment-contract-id').value;
  
  // Tự động tính toán thực tế giải ngân
  const request = parseFloat(parseVNNumber(document.getElementById('form-payment-request').value)) || 0;
  const dedAdvance = parseFloat(parseVNNumber(document.getElementById('form-payment-deduction-advance').value)) || 0;
  const dedMaterial = parseFloat(parseVNNumber(document.getElementById('form-payment-deduction-material').value)) || 0;
  const dedElec = parseFloat(parseVNNumber(document.getElementById('form-payment-deduction-electricity').value)) || 0;
  const dedWater = parseFloat(parseVNNumber(document.getElementById('form-payment-deduction-water').value)) || 0;
  const dedPenalty = parseFloat(parseVNNumber(document.getElementById('form-payment-deduction-penalty').value)) || 0;
  const dedCross = parseFloat(parseVNNumber(document.getElementById('form-payment-deduction-cross').value)) || 0;
  const dedOther = parseFloat(parseVNNumber(document.getElementById('form-payment-deduction-other').value)) || 0;
  const retention = parseFloat(parseVNNumber(document.getElementById('form-payment-retention').value)) || 0;
  
  const paidCalculated = request; // Giá trị giải ngân thanh toán chính là bằng giá trị đề nghị thanh toán

  const paymentData = {
    contractId: contractId,
    period: document.getElementById('form-payment-period').value,
    type: document.getElementById('form-payment-type').value,
    status: document.getElementById('form-payment-status').value,
    
    receiveDate: document.getElementById('form-payment-receive-date').value,
    completeDate: document.getElementById('form-payment-complete-date').value,
    accountingTransferDate: document.getElementById('form-payment-accounting-transfer-date').value,
    handler: document.getElementById('form-payment-handler').value.trim(),
    
    completedAmount: parseFloat(parseVNNumber(document.getElementById('form-payment-completed-amount').value)) || 0,
    requestAmount: request,
    
    deductionAdvance: dedAdvance,
    deductionMaterial: dedMaterial,
    deductionElectricity: dedElec,
    deductionWater: dedWater,
    deductionPenalty: dedPenalty,
    deductionCross: dedCross,
    deductionOther: dedOther,
    retentionAmount: retention,
    
    paidAmount: paidCalculated,
    paidDate: document.getElementById('form-payment-date').value
  };

  if (!paymentData.period || paymentData.requestAmount <= 0 || !paymentData.receiveDate || !paymentData.handler) {
    alert('Vui lòng nhập đầy đủ các trường bắt buộc (*): Nội dung, Đề nghị thanh toán, Ngày nhận hồ sơ, Cán bộ thực hiện.');
    return;
  }

  if (paymentData.status === 'paid' && !paymentData.paidDate) {
    paymentData.paidDate = new Date().toISOString().split('T')[0];
  }

  if (id) {
    window.db.updatePayment(state.currentProjectId, id, paymentData);
    alert('Cập nhật đợt thanh toán thành công!');
  } else {
    window.db.addPayment(state.currentProjectId, paymentData);
    alert('Lập đợt thanh toán thành công!');
  }

  closeModal('modal-payment');
  renderPaymentsTab();
}


// 7. RISK MODAL
function openRiskModal(r = null) {
  const form = document.getElementById('form-risk');
  form.reset();
  
  const title = document.getElementById('modal-risk-title');
  const idInput = document.getElementById('form-risk-id');

  if (r) {
    title.textContent = 'Cập nhật Rủi ro Chi phí';
    idInput.value = r.id;
    document.getElementById('form-risk-description').value = r.description;
    document.getElementById('form-risk-probability').value = r.probability;
    document.getElementById('form-risk-impact').value = r.impact;
    document.getElementById('form-risk-cost').value = formatVNNumber(r.contingencyCost);
    document.getElementById('form-risk-mitigation').value = r.mitigation;
    document.getElementById('form-risk-status').value = r.status;
  } else {
    title.textContent = 'Khai báo Rủi ro Chi phí mới';
    idInput.value = '';
    document.getElementById('form-risk-probability').value = 'medium';
    document.getElementById('form-risk-impact').value = 'medium';
    document.getElementById('form-risk-status').value = 'active';
  }

  openModal('modal-risk');
}

function submitRiskForm() {
  const id = document.getElementById('form-risk-id').value;
  const riskData = {
    description: document.getElementById('form-risk-description').value,
    probability: document.getElementById('form-risk-probability').value,
    impact: document.getElementById('form-risk-impact').value,
    contingencyCost: parseFloat(parseVNNumber(document.getElementById('form-risk-cost').value)) || 0,
    mitigation: document.getElementById('form-risk-mitigation').value,
    status: document.getElementById('form-risk-status').value
  };

  if (!riskData.description || riskData.contingencyCost <= 0 || !riskData.mitigation) {
    alert('Vui lòng nhập mô tả rủi ro, dự phòng tài chính và biện pháp khắc phục (*).');
    return;
  }

  if (id) {
    window.db.updateRisk(state.currentProjectId, id, riskData);
    alert('Cập nhật rủi ro thành công!');
  } else {
    window.db.addRisk(state.currentProjectId, riskData);
    alert('Khai báo rủi ro chi phí thành công!');
  }

  closeModal('modal-risk');
  renderRisksTab();
}

// --- EXPORT CSV ---
function exportToExcel() {
  const activeTab = state.activeTab;
  let tableSelector = '';
  let sheetName = 'Du_lieu';
  let title = 'BÁO CÁO';
  
  if (activeTab === 'tmdt') {
    tableSelector = '#tmdt-matrix-table';
    sheetName = 'TMDT';
    title = 'BÁO CÁO TỔNG MỨC ĐẦU TƯ';
  } else if (activeTab === 'budgets') {
    tableSelector = '#budgets-table';
    sheetName = 'NganSach';
    title = 'BÁO CÁO NGÂN SÁCH GÓI THẦU';
  } else if (activeTab === 'bids') {
    tableSelector = '#bids-table';
    sheetName = 'GoiThau';
    title = 'BÁO CÁO GÓI THẦU';
  } else if (activeTab === 'contracts') {
    tableSelector = '#contracts-table';
    sheetName = 'HopDong';
    title = 'BÁO CÁO HỢP ĐỒNG';
  } else if (activeTab === 'variations') {
    tableSelector = '#variations-table';
    sheetName = 'PhatSinh';
    title = 'BÁO CÁO PHÁT SINH CHI PHÍ';
  } else if (activeTab === 'payments') {
    tableSelector = '#payments-table';
    sheetName = 'ThanhToan';
    title = 'BÁO CÁO THANH TOÁN';
  } else if (activeTab === 'materials') {
    tableSelector = '#materials-table';
    sheetName = 'VatTu';
    title = 'BÁO CÁO VẬT TƯ';
  } else if (activeTab === 'risks') {
    tableSelector = '#risks-table';
    sheetName = 'RuiRo';
    title = 'BÁO CÁO RỦI RO';
  } else if (activeTab === 'officers') {
    tableSelector = '#officers-table';
    sheetName = 'CanBo';
    title = 'BÁO CÁO CÁN BỘ PHỤ TRÁCH';
  } else if (activeTab === 'projects' || activeTab === 'dashboard') {
    tableSelector = '#all-projects-table';
    sheetName = 'DuAn';
    title = 'DANH SÁCH DỰ ÁN';
  }
  
  if (!tableSelector) {
    alert('Tab này không có bảng dữ liệu để xuất!');
    return;
  }
  
  const table = document.querySelector(tableSelector);
  if (!table) {
    alert('Không tìm thấy dữ liệu bảng!');
    return;
  }
  
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.views = [{ showGridLines: true }];

  const borderStyle = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' }
  };

  const thead = table.querySelector('thead');
  const headers = [];
  if (thead) {
    const ths = Array.from(thead.querySelectorAll('th')).filter(th => {
      const style = window.getComputedStyle(th);
      return style.display !== 'none' && !th.classList.contains('hidden');
    });
    
    ths.forEach(th => {
      headers.push(th.innerText.trim().replace(/\n/g, ' '));
    });
  }

  const colCount = Math.max(headers.length - 1, 1);

  sheet.mergeCells(1, 1, 1, colCount);
  const titleRow = sheet.getRow(1);
  titleRow.getCell(1).value = title;
  titleRow.height = 35;
  titleRow.getCell(1).font = { name: 'Times New Roman', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

  const proj = state.currentProjectId === 'all' ? null : window.db.getProjectById(state.currentProjectId);
  if (proj) {
    sheet.mergeCells(2, 1, 2, colCount);
    const subTitle = sheet.getRow(2);
    subTitle.getCell(1).value = `Dự án: ${proj.name}`;
    subTitle.getCell(1).font = { name: 'Times New Roman', size: 12, bold: true };
  }

  const headerRow = sheet.getRow(4);
  headerRow.height = 25;
  let excelColIndex = 1;
  headers.forEach((h, i) => {
    if (h.toLowerCase() === 'thao tác' || h.toLowerCase() === 'action') return;
    const cell = headerRow.getCell(excelColIndex);
    cell.value = h;
    cell.font = { name: 'Times New Roman', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5597' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = borderStyle;
    excelColIndex++;
  });

  const tbody = table.querySelector('tbody');
  let currentRowIdx = 5;
  if (tbody) {
    const trs = tbody.querySelectorAll('tr');
    trs.forEach((tr) => {
      if (tr.classList.contains('empty-state')) return;
      if (window.getComputedStyle(tr).display === 'none') return;
      
      const tds = Array.from(tr.querySelectorAll('td, th')).filter(td => {
        const style = window.getComputedStyle(td);
        return style.display !== 'none' && !td.classList.contains('hidden');
      });
      
      const row = sheet.getRow(currentRowIdx);
      
      if (tds.length === 1 && (tds[0].colSpan > 1 || tds.length < headers.length - 1)) {
        const cell = row.getCell(1);
        cell.value = tds[0].innerText.trim();
        sheet.mergeCells(currentRowIdx, 1, currentRowIdx, colCount);
        cell.font = { name: 'Times New Roman', size: 12, bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
        cell.border = borderStyle;
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
        currentRowIdx++;
        return;
      }
      
      let dataColIdx = 1;
      tds.forEach((td, cIdx) => {
        const h = headers[cIdx] ? headers[cIdx].toLowerCase() : '';
        if (h === 'thao tác' || h === 'action') return;
        
        let text = td.innerText.trim();
        const cell = row.getCell(dataColIdx);
        
        if (/^[0-9,]+(\.[0-9]+)?( đ| VND|%)?$/.test(text) && text !== '') {
          let numStr = text.replace(/ đ| VND|%/g, '').replace(/,/g, '');
          let num = parseFloat(numStr);
          if (!isNaN(num)) {
            if (text.includes('%')) {
              cell.value = num / 100;
              cell.numFmt = '0.0%';
            } else {
              cell.value = num;
              cell.numFmt = '#,##0';
            }
          } else {
            cell.value = text;
          }
        } else {
          cell.value = text;
        }

        cell.font = { name: 'Times New Roman', size: 12 };
        
        if (tr.style.fontWeight === 'bold' || tr.querySelector('strong')) {
          cell.font = { name: 'Times New Roman', size: 12, bold: true };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F9F9' } };
        }
        
        cell.border = borderStyle;
        cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        dataColIdx++;
      });
      
      currentRowIdx++;
    });
  }

  sheet.columns.forEach(col => {
    let maxLen = 0;
    col.eachCell({ includeEmpty: true }, cell => {
      if (cell.value) {
        const valStr = cell.value.toString();
        if (valStr.length > maxLen) maxLen = valStr.length;
      }
    });
    col.width = Math.min(Math.max(maxLen + 4, 15), 50);
  });

  const fileName = `Bao_cao_${sheetName}_${new Date().getTime()}.xlsx`;
  workbook.xlsx.writeBuffer().then(buffer => {
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });
}


// --- 9. Tab Danh sách Cán bộ ---

function renderOfficerTasksDetails() {
  const tableBody = document.querySelector('#officer-tasks-table tbody');
  const filterPerson = document.getElementById('filter-officer-task-person')?.value || 'all';
  const filterType = document.getElementById('filter-officer-task-type')?.value || 'all';
  const filterStatus = document.getElementById('filter-officer-task-status')?.value || 'all';
  
  if (!tableBody) return;
  tableBody.innerHTML = '';

  const officers = window.db.getOfficers();
  const isAll = state.currentProjectId === 'all';
  const projects = isAll ? window.db.getProjects() : [window.db.getProjectById(state.currentProjectId)];
  
  // Update person filter options if empty
  const personSelect = document.getElementById('filter-officer-task-person');
  if (personSelect && personSelect.options.length <= 1) {
    officers.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.name;
      opt.textContent = o.name;
      personSelect.appendChild(opt);
    });
  }

  let allBids = [];
  let allContracts = [];
  let allPayments = [];
  let allVariations = [];
  let allMilestones = [];

  projects.forEach(p => {
    if (p) {
      if (p.bids) allBids.push(...p.bids);
      if (p.contracts) allContracts.push(...p.contracts);
      if (p.payments) allPayments.push(...p.payments);
      if (p.variations) allVariations.push(...p.variations);
      if (p.milestones) allMilestones.push(...p.milestones);
    }
  });

  const today = new Date().toISOString().split('T')[0];
  const msPerDay = 24 * 60 * 60 * 1000;
  let allTasks = [];

  officers.forEach(o => {
    if (filterPerson !== 'all' && filterPerson !== o.name) return;

    // 1. Bids
    const officerBids = allBids.filter(b => b.handler === o.name);
    officerBids.forEach(b => {
      if (filterType !== 'all' && filterType !== 'Bidding') return;
      const wbs = allMilestones.find(m => m.targetId === b.id && m.type === 'milestone');
      let status = 'pending';
      let delayedDays = 0;
      let startDate = wbs ? wbs.planStart : '';
      let endDate = wbs ? wbs.planEnd : '';
      
      if (wbs) {
        if (wbs.progress === 100) {
          status = 'completed';
        } else if (wbs.progress === 0 && wbs.planStart > today) {
          status = 'not_started';
        } else if (wbs.planEnd < today && wbs.progress < 100) {
          status = 'delayed';
          delayedDays = Math.floor((new Date(today) - new Date(wbs.planEnd)) / msPerDay);
        }
      }
      
      allTasks.push({
        officer: o.name,
        taskName: b.name,
        type: 'Bidding',
        typeName: 'Gói thầu',
        startDate: startDate,
        endDate: endDate,
        status: status,
        delayedDays: delayedDays
      });
    });

    // 2. Contracts
    const officerContracts = allContracts.filter(c => officerBids.some(b => b.id === c.bidId));
    officerContracts.forEach(c => {
      if (filterType !== 'all' && filterType !== 'Contract') return;
      let status = 'pending';
      let delayedDays = 0;
      
      if (c.status === 'completed' || c.status === 'terminated') {
        status = 'completed';
      } else if (!c.signingDate || c.signingDate > today) {
        status = 'not_started';
      } else if (c.completionDate && c.completionDate < today) {
        status = 'delayed';
        delayedDays = Math.floor((new Date(today) - new Date(c.completionDate)) / msPerDay);
      }
      
      allTasks.push({
        officer: o.name,
        taskName: c.code ? `${esc(c.code)} - ${esc(c.content)}` : c.content,
        type: 'Contract',
        typeName: 'Hợp đồng',
        startDate: c.signingDate || '',
        endDate: c.completionDate || '',
        status: status,
        delayedDays: delayedDays
      });
    });

    // 3. Payments
    const officerPayments = allPayments.filter(p => p.handler === o.name);
    officerPayments.forEach(p => {
      if (filterType !== 'all' && filterType !== 'Payment') return;
      let status = 'pending';
      let delayedDays = 0;
      
      if (p.status === 'paid') {
        status = 'completed';
      } else if (!p.receiveDate) {
        status = 'not_started';
      } else {
        const daysDiff = Math.floor((new Date(today) - new Date(p.receiveDate)) / msPerDay);
        if (daysDiff > 7) {
          status = 'delayed';
          delayedDays = daysDiff - 7;
        }
      }
      
      // Calculate end date (receiveDate + 7 days)
      let expectedEndDate = '';
      if (p.receiveDate) {
        const d = new Date(p.receiveDate);
        d.setDate(d.getDate() + 7);
        expectedEndDate = d.toISOString().split('T')[0];
      }
      
      allTasks.push({
        officer: o.name,
        taskName: p.stage || `Thanh toán đợt ${esc(p.code || '')}`,
        type: 'Payment',
        typeName: 'Thanh toán',
        startDate: p.receiveDate || '',
        endDate: expectedEndDate,
        status: status,
        delayedDays: delayedDays
      });
    });

    // 4. Variations
    const officerVariations = allVariations.filter(v => v.handler === o.name);
    officerVariations.forEach(v => {
      if (filterType !== 'all' && filterType !== 'Variation') return;
      let status = 'pending';
      let delayedDays = 0;
      
      if (v.status === 'approved' || v.status === 'rejected') {
        status = 'completed';
      } else if (!v.receiveDate) {
        status = 'not_started';
      } else {
        const daysDiff = Math.floor((new Date(today) - new Date(v.receiveDate)) / msPerDay);
        if (daysDiff > 5) {
          status = 'delayed';
          delayedDays = daysDiff - 5;
        }
      }
      
      // Calculate end date (receiveDate + 5 days)
      let expectedEndDate = '';
      if (v.receiveDate) {
        const d = new Date(v.receiveDate);
        d.setDate(d.getDate() + 5);
        expectedEndDate = d.toISOString().split('T')[0];
      }
      
      allTasks.push({
        officer: o.name,
        taskName: v.content || `Phát sinh ${esc(v.code || '')}`,
        type: 'Variation',
        typeName: 'Phát sinh',
        startDate: v.receiveDate || '',
        endDate: expectedEndDate,
        status: status,
        delayedDays: delayedDays
      });
    });
  });

  // Filter by status
  if (filterStatus !== 'all') {
    allTasks = allTasks.filter(t => t.status === filterStatus);
  }

  if (allTasks.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 30px 0;">Không tìm thấy công việc nào phù hợp.</td></tr>`;
    return;
  }

  // Save current filtered tasks globally for export
  window.currentOfficerTasks = allTasks;

  const statusLabels = {
    'pending': '<span class="badge badge-warning">Đang thực hiện</span>',
    'completed': '<span class="badge badge-success">Đã xong</span>',
    'not_started': '<span class="badge badge-secondary">Chưa làm</span>',
    'delayed': '<span class="badge badge-danger">Chậm tiến độ</span>'
  };

  allTasks.forEach(task => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${task.officer}</strong></td>
      <td>${task.taskName}</td>
      <td>${task.typeName}</td>
      <td style="text-align: center;">${formatDate(task.startDate)}</td>
      <td style="text-align: center;">${formatDate(task.endDate)}</td>
      <td style="text-align: center;">${statusLabels[task.status] || task.status}</td>
      <td style="text-align: center; color: ${task.delayedDays > 0 ? 'var(--color-danger)' : 'inherit'}; font-weight: ${task.delayedDays > 0 ? '600' : 'normal'}">${task.delayedDays > 0 ? task.delayedDays : '-'}</td>
    `;
    tableBody.appendChild(tr);
  });
  lucide.createIcons();
}

async function exportOfficerTasksToExcel() {
  if (!window.currentOfficerTasks || window.currentOfficerTasks.length === 0) {
    alert('Không có dữ liệu để xuất!');
    return;
  }
  
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Chi tiết công việc');
  
  worksheet.columns = [
    { header: 'Họ và tên', key: 'officer', width: 25 },
    { header: 'Công việc đang thực hiện', key: 'taskName', width: 50 },
    { header: 'Phân loại', key: 'typeName', width: 20 },
    { header: 'Ngày bắt đầu', key: 'startDate', width: 15 },
    { header: 'Ngày kết thúc', key: 'endDate', width: 15 },
    { header: 'Tình trạng', key: 'status', width: 20 },
    { header: 'Số ngày chậm', key: 'delayedDays', width: 15 }
  ];
  
  // Style header
  worksheet.getRow(1).font = { name: 'Times New Roman', bold: true, size: 12 };
  worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
  
  const statusText = {
    'pending': 'Đang thực hiện',
    'completed': 'Đã xong',
    'not_started': 'Chưa làm',
    'delayed': 'Chậm tiến độ'
  };
  
  window.currentOfficerTasks.forEach((task, index) => {
    const row = worksheet.addRow({
      officer: task.officer,
      taskName: task.taskName,
      typeName: task.typeName,
      startDate: formatDate(task.startDate),
      endDate: formatDate(task.endDate),
      status: statusText[task.status] || task.status,
      delayedDays: task.delayedDays > 0 ? task.delayedDays : ''
    });
    
    row.font = { name: 'Times New Roman', size: 12 };
    
    // Add border to all cells
    row.eachCell((cell) => {
      cell.border = {
        top: {style:'thin'},
        left: {style:'thin'},
        bottom: {style:'thin'},
        right: {style:'thin'}
      };
    });
  });
  
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Chi_tiet_cong_viec_can_bo.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
function renderOfficersTab() {
  const tableBody = document.querySelector('#officers-table tbody');
  if (!tableBody) return;
  tableBody.innerHTML = '';

  const officers = window.db.getOfficers();
  const isAll = state.currentProjectId === 'all';
  const projects = isAll ? window.db.getProjects() : [window.db.getProjectById(state.currentProjectId)];


  if (officers.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 30px 0;">Chưa khai báo cán bộ nào.</td></tr>`;
  } else {
    const today = new Date().toISOString().split('T')[0];
    const msPerDay = 24 * 60 * 60 * 1000;
    
    let allBids = [];
    let allContracts = [];
    let allPayments = [];
    let allVariations = [];
    let allMilestones = [];
    
    projects.forEach(p => {
       if (p) {
         if (p.bids) allBids.push(...p.bids);
         if (p.contracts) allContracts.push(...p.contracts);
         if (p.payments) allPayments.push(...p.payments);
         if (p.variations) allVariations.push(...p.variations);
         if (p.milestones) allMilestones.push(...p.milestones);
       }
    });


    officers.forEach(o => {
      // 1. Bids
      const officerBids = allBids.filter(b => b.handler === o.name);
      let bidsTotal = officerBids.length;
      let bidsDelayed = 0;
      officerBids.forEach(b => {
        const wbs = allMilestones.find(m => m.targetId === b.id && m.type === 'milestone');
        if (wbs && wbs.planEnd < today && wbs.progress < 100) {
          bidsDelayed++;
        }
      });

      // 2. Contracts (linked to Bids)
      const officerContracts = allContracts.filter(c => {
         const relatedBid = officerBids.find(b => b.id === c.bidId);
         return !!relatedBid;
      });
      let contractsTotal = officerContracts.length;
      let contractsDelayed = 0;
      officerContracts.forEach(c => {
         if (c.completionDate && c.completionDate < today && c.status !== 'completed' && c.status !== 'terminated') {
           contractsDelayed++;
         }
      });

      // 3. Payments
      const officerPayments = allPayments.filter(p => p.handler === o.name);
      let paymentsTotal = officerPayments.length;
      let paymentsDelayed = 0;
      officerPayments.forEach(p => {
         if (p.status !== 'paid' && p.receiveDate) {
           const daysDiff = (new Date(today) - new Date(p.receiveDate)) / msPerDay;
           if (daysDiff > 7) paymentsDelayed++;
         }
      });

      // 4. Variations
      const officerVariations = allVariations.filter(v => v.handler === o.name);
      let variationsTotal = officerVariations.length;
      let variationsDelayed = 0;
      officerVariations.forEach(v => {
         if (v.status !== 'approved' && v.status !== 'rejected' && v.receiveDate) {
           const daysDiff = (new Date(today) - new Date(v.receiveDate)) / msPerDay;
           if (daysDiff > 5) variationsDelayed++;
         }
      });

      const totalAll = bidsTotal + contractsTotal + paymentsTotal + variationsTotal;
      const delayedAll = bidsDelayed + contractsDelayed + paymentsDelayed + variationsDelayed;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${esc(o.name)}</strong></td>
        <td>${esc(o.position)}</td>
        <td style="text-align: center;">${bidsTotal} / <span style="color: ${bidsDelayed > 0 ? 'var(--color-danger)' : 'inherit'}; font-weight: ${bidsDelayed > 0 ? '600' : 'normal'}">${bidsDelayed}</span></td>
        <td style="text-align: center;">${contractsTotal} / <span style="color: ${contractsDelayed > 0 ? 'var(--color-danger)' : 'inherit'}; font-weight: ${contractsDelayed > 0 ? '600' : 'normal'}">${contractsDelayed}</span></td>
        <td style="text-align: center;">${paymentsTotal} / <span style="color: ${paymentsDelayed > 0 ? 'var(--color-danger)' : 'inherit'}; font-weight: ${paymentsDelayed > 0 ? '600' : 'normal'}">${paymentsDelayed}</span></td>
        <td style="text-align: center;">${variationsTotal} / <span style="color: ${variationsDelayed > 0 ? 'var(--color-danger)' : 'inherit'}; font-weight: ${variationsDelayed > 0 ? '600' : 'normal'}">${variationsDelayed}</span></td>
        <td style="text-align: center; background-color: rgba(99,102,241,0.05); font-weight: 600;">${totalAll} / <span style="color: ${delayedAll > 0 ? 'var(--color-danger)' : 'inherit'};">${delayedAll}</span></td>
        <td>
          <button class="btn btn-secondary btn-sm btn-icon-only edit-officer-btn" data-id="${o.id}"><i data-lucide="edit-2"></i></button>
          <button class="btn btn-danger btn-sm btn-icon-only delete-officer-btn" data-id="${o.id}"><i data-lucide="trash-2"></i></button>
        </td>
      `;
      tableBody.appendChild(tr);
    });
  }

  // Gắn sự kiện sửa
  document.querySelectorAll('.edit-officer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const offId = btn.getAttribute('data-id');
      const o = window.db.getOfficers().find(item => item.id === offId);
      if (o) openOfficerModal(o);
    });
  });

  // Gắn sự kiện xóa
  document.querySelectorAll('.delete-officer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const offId = btn.getAttribute('data-id');
      if (confirm('Bạn có chắc chắn muốn xóa cán bộ này?')) {
        window.db.deleteOfficer(offId);
        populateOfficerSelects();
        renderOfficersTab();
      }
    });
  });

  renderOfficerTasksDetails();

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function openOfficerModal(o = null) {
  const form = document.getElementById('form-officer');
  form.reset();

  const title = document.getElementById('modal-officer-title');
  const idInput = document.getElementById('form-officer-id');

  if (o) {
    title.textContent = 'Cập nhật Cán bộ';
    idInput.value = o.id;
    document.getElementById('form-officer-name').value = o.name;
    document.getElementById('form-officer-position').value = o.position;
  } else {
    title.textContent = 'Thêm cán bộ mới';
    idInput.value = '';
  }

  openModal('modal-officer');
}

function submitOfficerForm() {
  const id = document.getElementById('form-officer-id').value;
  const officerData = {
    name: document.getElementById('form-officer-name').value.trim(),
    position: document.getElementById('form-officer-position').value.trim()
  };

  if (!officerData.name || !officerData.position) {
    alert('Vui lòng nhập đầy đủ thông tin bắt buộc (*).');
    return;
  }

  if (id) {
    window.db.updateOfficer(id, officerData);
    alert('Cập nhật thông tin cán bộ thành công!');
  } else {
    window.db.addOfficer(officerData);
    alert('Thêm cán bộ mới thành công!');
  }

  closeModal('modal-officer');
  populateOfficerSelects();
  renderOfficersTab();
}

function populateOfficerSelects() {
  const officers = window.db.getOfficers();
  const selectIds = ['form-bid-handler', 'form-payment-handler', 'form-variation-handler'];
  selectIds.forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    
    // Lưu lại giá trị cũ nếu có
    const oldValue = select.value;
    select.innerHTML = '';
    
    // Tùy chọn mặc định/trống
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = '--- Chọn cán bộ thực hiện ---';
    select.appendChild(emptyOpt);
    
    officers.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.name; // Lưu theo tên để tương thích ngược
      opt.textContent = `${o.name} (${o.position})`;
      select.appendChild(opt);
    });
    
    // Khôi phục giá trị cũ nếu hợp lệ
    if (oldValue) {
      select.value = oldValue;
    }
  });
}

// --- 10. Cấu hình Đa nhà cung cấp AI ---
const PROVIDERS = {
  gemini: {
    name: 'Google Gemini',
    apiKeyLink: 'https://aistudio.google.com/',
    info: 'Google Gemini cung cấp các mô hình tốc độ cao và hoàn toàn miễn phí (Free Tier) với giới hạn 15 requests/phút (RPM). Rất thích hợp cho phân tích chi phí dự án.',
    models: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash ⭐ (Tốc độ & Miễn phí)' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash ⭐ (Nhanh & Miễn phí)' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro ⚠️ (Cần billing)' }
    ],
    defaultModel: 'gemini-2.0-flash',
    placeholder: 'AIzaSy...'
  },
  groq: {
    name: 'Groq',
    apiKeyLink: 'https://console.groq.com/keys',
    info: 'Groq cung cấp tốc độ phản hồi cực nhanh (500+ tokens/giây) và hoàn toàn miễn phí cho các mô hình mã nguồn mở như Llama 3.3 và Gemma 2.',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B ⭐ (Mạnh nhất, miễn phí)' },
      { id: 'gemma2-9b-it', name: 'Gemma 2 9B ⭐ (Nhanh & thông minh)' },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B (Siêu tốc độ)' }
    ],
    defaultModel: 'llama-3.3-70b-versatile',
    placeholder: 'gsk_...'
  },
  openrouter: {
    name: 'OpenRouter',
    apiKeyLink: 'https://openrouter.ai/keys',
    info: 'OpenRouter là cổng kết nối trung gian, cho phép sử dụng hàng chục mô hình miễn phí (hậu tố :free) mà không lo quá tải giới hạn của một hãng.',
    models: [
      { id: 'deepseek/deepseek-chat:free', name: 'DeepSeek V3 ⭐ (Cực thông minh, miễn phí)' },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B Free ⭐ (Mạnh mẽ)' },
      { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash Free ⭐' },
      { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B Free' }
    ],
    defaultModel: 'deepseek/deepseek-chat:free',
    placeholder: 'sk-or-v1-...'
  },
  mistral: {
    name: 'Mistral AI',
    apiKeyLink: 'https://console.mistral.ai/api-keys/',
    info: 'Mistral AI là hãng AI nổi tiếng của Pháp. Họ cung cấp API Key miễn phí (Tier 1) để chạy các mô hình mã nguồn mở Mistral chất lượng cao.',
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large ⚠️ (Mạnh nhất, có thể có phí)' },
      { id: 'codestral-latest', name: 'Codestral (Tối ưu cho code/lập luận)' },
      { id: 'open-mistral-7b', name: 'Mistral 7B ⭐ (Nhẹ & Miễn phí)' },
      { id: 'pixtral-12b-2409', name: 'Pixtral 12B' }
    ],
    defaultModel: 'open-mistral-7b',
    placeholder: '...'
  }
};

function updateAiProviderUI() {
  const providerSelect = document.getElementById('ai-provider-select');
  if (!providerSelect) return;
  const provider = providerSelect.value;
  const infoBox = document.getElementById('ai-provider-info');
  const apiKeyInput = document.getElementById('ai-api-key');
  const apiKeyLabel = document.getElementById('ai-api-key-label');
  const modelSelect = document.getElementById('ai-model-select');

  const pData = PROVIDERS[provider];
  if (!pData) return;

  // 1. Update Info Box
  if (infoBox) {
    infoBox.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 4px; color: var(--text-main);">${esc(pData.name)}</div>
      <div>${pData.info}</div>
      <div style="margin-top: 8px; border-top: 1px solid var(--border-glass); padding-top: 6px;">
        👉 <a href="${pData.apiKeyLink}" target="_blank" style="color: var(--color-info); text-decoration: none; font-weight: 600;">Nhấp vào đây để lấy API Key miễn phí của ${esc(pData.name)}</a>
      </div>
    `;
  }

  // 2. Load API Key
  if (apiKeyInput) {
    apiKeyInput.value = localStorage.getItem(`antigravity_${provider}_api_key`) || '';
    apiKeyInput.placeholder = pData.placeholder;
  }
  if (apiKeyLabel) {
    apiKeyLabel.textContent = `🔑 API Key (${pData.name})`;
  }

  // 3. Populate Models
  if (modelSelect) {
    modelSelect.innerHTML = '';
    pData.models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      modelSelect.appendChild(opt);
    });

    const savedModel = localStorage.getItem(`antigravity_${provider}_model`) || pData.defaultModel;
    if (Array.from(modelSelect.options).some(o => o.value === savedModel)) {
      modelSelect.value = savedModel;
    } else {
      modelSelect.value = pData.defaultModel;
    }
  }
}

async function fetchAndPopulateModels(apiKey) {
  const providerSelect = document.getElementById('ai-provider-select');
  const provider = providerSelect?.value || 'gemini';
  
  if (provider !== 'gemini') {
    updateAiProviderUI();
    return;
  }

  // Đối với Gemini, nếu có API Key, chúng ta tải danh sách mô hình thực tế từ Google
  const modelSelect = document.getElementById('ai-model-select');
  if (!modelSelect) return;
  if (!apiKey) {
    updateAiProviderUI();
    return;
  }

  const currentVal = modelSelect.value || localStorage.getItem('antigravity_gemini_model') || 'gemini-1.5-flash';
  
  let models = [];
  const apiVersions = ['v1', 'v1beta'];
  let success = false;

  for (let version of apiVersions) {
    const url = `https://generativelanguage.googleapis.com/${version}/models?key=${apiKey}`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.models && data.models.length > 0) {
          models = data.models;
          success = true;
          break;
        }
      }
    } catch (err) {
      console.warn(`Lỗi khi lấy danh sách mô hình từ phiên bản ${version}:`, err);
    }
  }

  const PREFERRED_FREE_MODELS = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-exp',
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash-8b',
  ];

  if (success && models.length > 0) {
    modelSelect.innerHTML = '';
    let filteredModels = models.filter(m => 
      m.supportedGenerationMethods && 
      m.supportedGenerationMethods.includes('generateContent') &&
      m.name.includes('gemini')
    );

    filteredModels.sort((a, b) => {
      const aId = a.name.replace('models/', '');
      const bId = b.name.replace('models/', '');
      const aIsFlash = aId.includes('flash');
      const bIsFlash = bId.includes('flash');
      if (aIsFlash && !bIsFlash) return -1;
      if (!aIsFlash && bIsFlash) return 1;
      return aId.localeCompare(bId);
    });

    if (filteredModels.length > 0) {
      filteredModels.forEach(m => {
        const fullId = m.name;
        const id = fullId.replace('models/', '');
        const opt = document.createElement('option');
        opt.value = id;
        
        let displayName = m.displayName || id;
        if (id.includes('1.5-flash')) {
          displayName += ' ⭐ (Nhanh & Miễn phí)';
        } else if (id.includes('2.0-flash-exp') || id.includes('2.0-flash')) {
          displayName += ' ⭐ (Tốc độ & Miễn phí)';
        } else if (id.includes('flash')) {
          displayName += ' (Flash - Nhanh)';
        } else if (id.includes('2.5-pro') || id.includes('pro')) {
          displayName += ' ⚠️ (Pro - Cần billing)';
        }
        opt.textContent = displayName;
        modelSelect.appendChild(opt);
      });

      const savedIsFlash = currentVal && currentVal.includes('flash');
      if (currentVal && savedIsFlash && Array.from(modelSelect.options).some(opt => opt.value === currentVal)) {
        modelSelect.value = currentVal;
      } else {
        let bestFree = null;
        for (const preferred of PREFERRED_FREE_MODELS) {
          const found = Array.from(modelSelect.options).find(opt => opt.value.startsWith(preferred) || opt.value === preferred);
          if (found) { bestFree = found.value; break; }
        }
        if (bestFree) {
          modelSelect.value = bestFree;
        } else {
          modelSelect.selectedIndex = 0;
        }
        localStorage.setItem('antigravity_gemini_model', modelSelect.value);
      }
      return;
    }
  }

  // Fallback nếu không tải được API
  updateAiProviderUI();
}

function renderAiTab() {
  const providerSelect = document.getElementById('ai-provider-select');
  if (providerSelect) {
    const savedProvider = localStorage.getItem('antigravity_ai_provider') || 'gemini';
    providerSelect.value = savedProvider;
  }
  updateAiProviderUI();
  applyAiConfigState();
}

function applyAiConfigState() {
  const provider = localStorage.getItem('antigravity_ai_provider') || 'gemini';
  const apiKey = localStorage.getItem(`antigravity_${provider}_api_key`) || '';
  const configCard = document.getElementById('ai-config-card');
  const successBanner = document.getElementById('ai-config-success');
  const successMsg = document.getElementById('ai-config-success-msg');

  if (apiKey) {
    if (configCard) configCard.style.display = 'none';
    if (successBanner) successBanner.style.display = '';
    const pName = PROVIDERS[provider]?.name || provider;
    if (successMsg) successMsg.textContent = `✅ Đã nhận cấu hình API Key của ${pName} (${apiKey.substring(0,8)}...)`;
  } else {
    if (configCard) configCard.style.display = '';
    if (successBanner) successBanner.style.display = 'none';
  }
}

// Hàm chuẩn bị ngữ cảnh dự án gửi cho AI
function prepareProjectContext() {
  const proj = window.db.getProjectById(state.currentProjectId);
  if (!proj) {
    return "Không có dự án nào đang được chọn hoặc dữ liệu dự án trống.";
  }

  // Trích xuất TMĐT
  const tmdtSummary = {};
  const cats = ['gpmb', 'construction', 'equipment', 'qlda', 'consulting', 'other', 'contingency'];
  cats.forEach(c => {
    if (proj.tmdt[c]) {
      tmdtSummary[c] = {
        approved: proj.tmdt[c].approved || 0,
        adjusted: proj.tmdt[c].adjusted || 0
      };
    }
  });

  // Rút gọn ngân sách
  const budgetsList = (proj.budgets || []).map(b => ({
    code: b.code,
    name: b.name,
    amount: b.amount,
    progress: b.progress
  }));

  // Rút gọn đấu thầu
  const bidsList = (proj.bids || []).map(b => ({
    code: b.code,
    name: b.name,
    estimateAmount: b.estimateAmount,
    bidAmount: b.bidAmount,
    winner: b.winner,
    status: b.status,
    handler: b.handler
  }));

  // Rút gọn hợp đồng
  const contractsList = (proj.contracts || []).map(c => ({
    id: c.id,
    code: c.code,
    name: c.name,
    partner: c.partner,
    value: c.value,
    status: c.status
  }));

  // Rút gọn phát sinh
  const variationsList = (proj.variations || []).map(v => ({
    code: v.code,
    name: v.name,
    requestAmount: v.requestAmount,
    approvedAmount: v.approvedAmount,
    status: v.status,
    receiveDate: v.receiveDate,
    completeDate: v.completeDate,
    handler: v.handler
  }));

  // Rút gọn thanh toán
  const paymentsList = (proj.payments || []).map(p => ({
    period: p.period,
    type: p.type,
    requestAmount: p.requestAmount,
    paidAmount: p.paidAmount,
    status: p.status,
    receiveDate: p.receiveDate,
    completeDate: p.completeDate,
    handler: p.handler
  }));

  // Rút gọn rủi ro
  const risksList = (proj.risks || []).map(r => ({
    description: r.description,
    impact: r.impact,
    probability: r.probability,
    contingencyCost: r.contingencyCost,
    status: r.status
  }));

  const context = {
    projectName: proj.name,
    location: proj.location,
    scale: proj.scale,
    startDate: proj.startDate,
    endDate: proj.endDate,
    tmdt: tmdtSummary,
    budgets: budgetsList,
    bids: bidsList,
    contracts: contractsList,
    variations: variationsList,
    payments: paymentsList,
    risks: risksList
  };

  return JSON.stringify(context, null, 2);
}

// Parser markdown đơn giản để hiển thị câu trả lời đẹp mắt
function parseMarkdown(text) {
  let html = esc(text);

  // Xử lý các khối code nếu có
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  
  // Xử lý in đậm
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // Xử lý danh sách gạch đầu dòng
  html = html.replace(/^\s*-\s+(.*)$/gm, '<li>$1</li>');
  // Gom các thẻ li kề nhau vào ul
  html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1<\/ul>');
  // Dọn dẹp lỗi bọc ul nhiều lần
  html = html.replace(/<\/ul>\s*<ul>/g, '');

  // Xử lý danh sách đánh số
  html = html.replace(/^\s*\d+\.\s+(.*)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/gs, '<ol>$1<\/ol>');
  html = html.replace(/<\/ol>\s*<ol>/g, '');
  
  // Xử lý tiêu đề h3, h4
  html = html.replace(/### (.*)/g, '<h3>$1</h3>');
  html = html.replace(/#### (.*)/g, '<h4>$1</h4>');

  // Chuyển bảng markdown (| cột | cột |) thành bảng HTML
  html = html.replace(/((?:^\s*\|.*\|\s*$\n?)+)/gm, (block) => {
    const rows = block.trim().split('\n').map(r => r.trim()).filter(r => r.startsWith('|'));
    if (rows.length < 2) return block;
    let out = '<table class="ai-md-table"><tbody>';
    rows.forEach((row, idx) => {
      const cells = row.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      // Bỏ qua dòng phân cách dạng |---|---|
      if (cells.every(c => /^:?-{2,}:?$/.test(c))) return;
      const tag = idx === 0 ? 'th' : 'td';
      out += '<tr>' + cells.map(c => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
    });
    out += '</tbody></table>';
    return out;
  });

  // Thay thế xuống dòng thành thẻ br
  html = html.replace(/\n/g, '<br>');
  
  return html;
}

async function askGemini(question) {
  const provider = localStorage.getItem('antigravity_ai_provider') || 'gemini';
  const apiKey = localStorage.getItem(`antigravity_${provider}_api_key`);
  if (!apiKey) {
    appendChatMessage('system', 'Vui lòng cấu hình API Key ở khung bên trái trước khi đặt câu hỏi.');
    return;
  }

  // Hiển thị loading bubble
  const chatContainer = document.getElementById('chat-history-container');
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'chat-message ai loading-message';
  loadingDiv.innerHTML = `
    <div class="typing-loader">
      <span></span><span></span><span></span>
    </div>
  `;
  chatContainer.appendChild(loadingDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  const projectContext = prepareProjectContext();
  const systemInstruction = `Bạn là Trợ lý AI chuyên trách về quản lý chi phí, tiến độ, hợp đồng dự án đầu tư xây dựng/bất động sản.
Bạn có nhiệm vụ phân tích dữ liệu dự án được cung cấp dưới dạng JSON và trả lời câu hỏi của người dùng.
Nguyên tắc trả lời:
1. Luôn sử dụng tiếng Việt chuyên nghiệp, rõ ràng, thực tế.
2. Trả lời có cấu trúc rõ ràng, sử dụng bảng biểu, danh sách gạch đầu dòng khi thích hợp.
3. Chỉ dựa vào dữ liệu được cung cấp. Nếu dữ liệu thiếu hoặc không có thông tin, hãy nêu rõ, không tự bịa.
4. Trình bày số liệu tài chính rõ ràng (đồng VNĐ, ví dụ: 25.000.000.000 ₫ hoặc 25 tỷ ₫).`;

  const prompt = `Dưới đây là dữ liệu dự án hiện tại:
\`\`\`json
${projectContext}
\`\`\`

Câu hỏi của người dùng: "${question}"`;

  const pData = PROVIDERS[provider];
  const selectedModel = localStorage.getItem(`antigravity_${provider}_model`) || pData?.defaultModel || 'gemini-1.5-flash';
  
  let success = false;
  let errorMsg = '';
  let reply = '';

  if (provider === 'gemini') {
    // Thử gọi với API v1 (ổn định) trước, nếu lỗi/404 sẽ tự động chuyển sang v1beta làm fallback
    const apiVersions = ['v1', 'v1beta'];
    for (let version of apiVersions) {
      const endpoint = `https://generativelanguage.googleapis.com/${version}/models/${selectedModel}:generateContent?key=${apiKey}`;
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: prompt }]
              }
            ],
            systemInstruction: {
              parts: [{ text: systemInstruction }]
            },
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 2048
            }
          })
        });

        if (response.ok) {
          const data = await response.json();
          reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Không có phản hồi từ mô hình AI.";
          success = true;
          break;
        } else {
          const errData = await response.json();
          errorMsg = errData.error?.message || response.statusText;
          console.warn(`Lỗi khi gọi Gemini API với phiên bản ${version}:`, errorMsg);
        }
      } catch (e) {
        errorMsg = e.message;
        console.warn(`Lỗi mạng khi gọi Gemini API với phiên bản ${version}:`, errorMsg);
      }
    }
  } else {
    // Groq, OpenRouter, Mistral (OpenAI compatible)
    let endpoint = '';
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };

    if (provider === 'groq') {
      endpoint = 'https://api.groq.com/openai/v1/chat/completions';
    } else if (provider === 'openrouter') {
      endpoint = 'https://openrouter.ai/api/v1/chat/completions';
      headers['HTTP-Referer'] = window.location.href || 'http://localhost:8000';
      headers['X-Title'] = 'AntiGravity PM';
    } else if (provider === 'mistral') {
      endpoint = 'https://api.mistral.ai/v1/chat/completions';
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: prompt }
          ],
          temperature: 0.2,
          max_tokens: 2048
        })
      });

      if (response.ok) {
        const data = await response.json();
        reply = data.choices?.[0]?.message?.content || "Không có phản hồi từ mô hình AI.";
        success = true;
      } else {
        const errData = await response.json();
        errorMsg = errData.error?.message || response.statusText;
        console.warn(`Lỗi khi gọi API của ${provider}:`, errorMsg);
      }
    } catch (e) {
      errorMsg = e.message;
      console.warn(`Lỗi mạng khi gọi API của ${provider}:`, errorMsg);
    }
  }

  if (success) {
    loadingDiv.remove();
    appendChatMessage('ai', reply);
  } else {
    loadingDiv.remove();
    // Phân tích lỗi và đưa ra hướng dẫn thân thiện
    let friendlyMsg = '';
    const errLower = (errorMsg || '').toLowerCase();
    const pName = pData?.name || provider;

    if (errLower.includes('quota') || errLower.includes('rate limit') || errLower.includes('resource_exhausted') || errLower.includes('too many requests')) {
      friendlyMsg = `⚠️ **Đã vượt hạn mức miễn phí (Quota / Rate Limit) của ${pName}**\n\n`;
      if (selectedModel.includes('pro') || selectedModel.includes('large') || selectedModel.includes('2.5')) {
        friendlyMsg += `Model đang dùng: \`${selectedModel}\` có thể là model **Trả phí** hoặc yêu cầu billing.\n\n`;
        friendlyMsg += `✅ **Giải pháp**: Nhấn **"Đổi API Key"** ở trên → chọn các model có nhãn **Miễn phí** hoặc **Free** (như Flash, Llama 3.3 Free, DeepSeek V3 Free).\n`;
      } else {
        friendlyMsg += `Bạn đã gửi quá nhiều yêu cầu trong thời gian ngắn.\n\n`;
        friendlyMsg += `✅ **Giải pháp**: Chờ 1-2 phút rồi thử lại. Hoặc đăng ký lấy API key miễn phí mới của các hãng khác cực kỳ đơn giản ở mục Cấu hình bên trái.`;
      }
    } else if (errLower.includes('denied') || errLower.includes('permission') || errLower.includes('api_key_invalid') || errLower.includes('invalid api key') || errLower.includes('unauthorized') || errLower.includes('invalid argument')) {
      friendlyMsg = `🔑 **Lỗi API Key hoặc quyền truy cập của ${pName}**\n\n`;
      friendlyMsg += `Có thể do:\n• API Key không hợp lệ hoặc dán thiếu ký tự\n• Tài khoản chưa kích hoạt hoặc bị khóa\n• Model không khả dụng đối với gói tài khoản này\n\n`;
      friendlyMsg += `✅ **Giải pháp**:\n1. Nhấn **"Đổi API Key"** và dán lại chính xác API Key của ${pName}.\n2. Click vào link lấy API Key miễn phí tương ứng ở khu bên trái để đăng ký key mới.`;
    } else if (errLower.includes('not found') || errLower.includes('404') || errLower.includes('model')) {
      friendlyMsg = `❌ **Model không khả dụng**: \`${selectedModel}\` đối với nhà cung cấp ${pName}.\n\n`;
      friendlyMsg += `✅ **Giải pháp**: Nhấn **"Đổi API Key"** → chọn lại model mặc định của hãng đó → Lưu cấu hình.`;
    } else {
      friendlyMsg = `❌ **Lỗi kết nối API (${pName})**\n\nChi tiết lỗi: ${errorMsg}\n\n`;
      friendlyMsg += `✅ Vui lòng kiểm tra lại API Key dán vào hoặc thử chuyển đổi sang một Hãng AI khác (ví dụ: Groq, OpenRouter) rất nhanh và tiện lợi.`;
    }
    appendChatMessage('ai', friendlyMsg);
  }
}

function exportHtmlTableToCSV(tableEl) {
  let csvContent = "";
  const rows = tableEl.querySelectorAll('tr');
  rows.forEach(tr => {
    const cols = tr.querySelectorAll('th, td');
    const rowData = [];
    cols.forEach(col => {
      let text = col.innerText.trim();
      if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        text = `"${text.replace(/"/g, '""')}"`;
      }
      rowData.push(text);
    });
    csvContent += rowData.join(",") + "\n";
  });

  const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `ai_table_export_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function appendChatMessage(sender, text) {
  const chatContainer = document.getElementById('chat-history-container');
  if (!chatContainer) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-message ${sender}`;
  
  if (sender === 'ai') {
    msgDiv.innerHTML = parseMarkdown(text);
    
    // Tìm tất cả các bảng trong câu trả lời của AI và chèn thêm nút xuất Excel
    const tables = msgDiv.querySelectorAll('table');
    tables.forEach(table => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-secondary btn-sm btn-export-ai-table';
      btn.style.marginTop = '10px';
      btn.style.display = 'inline-flex';
      btn.style.alignItems = 'center';
      btn.style.gap = '5px';
      btn.innerHTML = '<i data-lucide="file-spreadsheet" style="width: 14px; height: 14px;"></i> Xuất Excel bảng này';
      btn.addEventListener('click', () => {
        exportHtmlTableToCSV(table);
      });
      
      // Chèn nút ngay sau bảng
      table.parentNode.insertBefore(btn, table.nextSibling);
    });
  } else {
    msgDiv.textContent = text;
  }

  chatContainer.appendChild(msgDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// --- UTILITIES FOR EXCEL IMPORT/EXPORT USING EXCELJS ---
const borderStyle = {
  top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
  left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
  bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
  right: { style: 'thin', color: { argb: 'FFD3D3D3' } }
};

function downloadExcelTemplate(type) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('File mẫu Import');

  sheet.views = [{ showGridLines: true }];

  let headers = [];
  let sampleData = [];
  let title = '';

  switch (type) {
    case 'budgets':
      title = 'BIỂU MẪU NHẬP NGÂN SÁCH DỰ ÁN';
      headers = [
        'Mã hạng mục (*)',
        'Tên hạng mục (*)',
        'Nhóm chi phí (* - gpmb / construction / equipment / qlda / consulting / other)',
        'Giá trị ngân sách (VNĐ)'
      ];
      sampleData = [
        ['NS-01', 'Chi phí bồi thường giải phóng mặt bằng', 'gpmb', 5000000000],
        ['NS-02', 'Chi phí xây dựng phần thô', 'construction', 15000000000],
        ['NS-03', 'Chi phí mua sắm thiết bị thang máy', 'equipment', 2500000000]
      ];
      break;

    case 'bids':
      title = 'BIỂU MẪU NHẬP GÓI THẦU';
      headers = [
        'Mã hạng mục ngân sách',
        'Mã gói thầu (*)',
        'Tên gói thầu (*)',
        'Dự toán được duyệt (VNĐ)',
        'Giá trúng thầu (VNĐ)',
        'Đơn vị trúng thầu',
        'Cán bộ phụ trách',
        'Trạng thái (* - planned / bidding / evaluated / awarded / cancelled)'
      ];
      sampleData = [
        ['NS-02', 'PN-KC-01', 'Gói thầu thi công cọc nhồi và kết cấu móng', 14800000000, 14200000000, 'Công ty Xây dựng Delta', 'Nguyễn Văn A', 'awarded'],
        ['NS-03', 'PN-TB-01', 'Gói thầu cung cấp thang máy Otis', 2400000000, 2350000000, 'Công ty Thiết bị Otis Việt Nam', 'Trần Thị B', 'bidding']
      ];
      break;

    case 'contracts':
      title = 'BIỂU MẪU NHẬP HỢP ĐỒNG';
      headers = [
        'Số hợp đồng (*)',
        'Tên hợp đồng (*)',
        'Chủ thể ký kết (CĐT)',
        'Nhà thầu/Đối tác (*)',
        'Loại hợp đồng (* - lump-sum / fixed-unit-price / adjustable-unit-price)',
        'Ngày hoàn thành dự kiến (YYYY-MM-DD)',
        'Giá trị hợp đồng gốc (VNĐ)',
        'Ngày ký (YYYY-MM-DD)',
        'Trạng thái (* - draft / active / completed / terminated)'
      ];
      sampleData = [
        ['HĐ-Delta-01', 'Hợp đồng thi công móng và hầm', 'Công ty CP Panorama', 'Công ty Xây dựng Delta', 'fixed-unit-price', '2026-12-31', 14200000000, '2026-06-01', 'active']
      ];
      break;

    case 'variations':
      title = 'BIỂU MẪU NHẬP PHÁT SINH CHI PHÍ';
      headers = [
        'Số quyết định/Tờ trình (*)',
        'Nội dung phát sinh (*)',
        'Số hợp đồng chính liên kết (*)',
        'Giá trị đề xuất (VNĐ)',
        'Giá trị phê duyệt (VNĐ)',
        'Ngày tiếp nhận (YYYY-MM-DD)',
        'Ngày hoàn thành (YYYY-MM-DD)',
        'Cán bộ thực hiện',
        'Trạng thái (* - draft / processing / approved / rejected)'
      ];
      sampleData = [
        ['PS-HĐ-01-01', 'Bổ sung gia cố sàn hầm tầng 1', 'HĐ-Delta-01', 350000000, 320000000, '2026-07-10', '2026-07-20', 'Nguyễn Văn A', 'approved']
      ];
      break;

    case 'payments':
      title = 'BIỂU MẪU NHẬP ĐỢT THANH TOÁN';
      headers = [
        'Đợt thanh toán (* - ví dụ: Đợt 1)',
        'Loại thanh toán (* - advance / payment / settlement)',
        'Số hợp đồng liên kết (*)',
        'Ngày nhận hồ sơ (YYYY-MM-DD)',
        'Ngày hoàn thành thủ tục (YYYY-MM-DD)',
        'Ngày chuyển kế toán (YYYY-MM-DD)',
        'Cán bộ thực hiện',
        'Giá trị đề nghị (VNĐ)',
        'Giá trị nghiệm thu hoàn thành (VNĐ)',
        'Khấu trừ tạm ứng (VNĐ)',
        'Khấu trừ vật tư CĐT cấp (VNĐ)',
        'Khấu trừ điện nước (VNĐ)',
        'Khấu trừ phạt vi phạm (VNĐ)',
        'Khấu trừ hỗ trợ nhà thầu khác (VNĐ)',
        'Khấu trừ khác (VNĐ)',
        'Giữ lại bảo hành/chưa thanh toán (VNĐ)',
        'Ngày thanh toán thực tế (YYYY-MM-DD)',
        'Giá trị thanh toán thực tế (VNĐ)',
        'Trạng thái (* - draft / processing / paid / rejected)'
      ];
      sampleData = [
        ['Tạm ứng lần 1', 'advance', 'HĐ-Delta-01', '2026-06-05', '2026-06-07', '2026-06-08', 'Trần Thị B', 2000000000, 0, 0, 0, 0, 0, 0, 0, 0, '2026-06-10', 2000000000, 'paid']
      ];
      break;

    case 'materials':
      title = 'BIỂU MẪU NHẬP VẬT TƯ CẤP PHÁT';
      headers = [
        'Nhà cung cấp (*)',
        'Số hợp đồng liên kết',
        'Tên vật tư (*)',
        'Đơn vị tính (*)',
        'Số lượng theo HĐ',
        'Số lượng nhập kho CĐT',
        'Ngày nhập kho (YYYY-MM-DD)',
        'Số Phiếu nhập / BB giao nhận',
        'Số lượng giao nhà thầu',
        'Ngày bàn giao (YYYY-MM-DD)',
        'Tên nhà thầu nhận',
        'Số lượng nhà thầu trả lại',
        'Ghi chú'
      ];
      sampleData = [
        ['Tổng Công ty Thép Miền Nam', 'HĐ-Delta-01', 'Thép cuộn D8 Hòa Phát', 'Tấn', 100, 50, '2026-06-15', 'PNK-001', 30, '2026-06-16', 'Nhà thầu Delta', 0, 'Bàn giao đợt 1 xây móng']
      ];
      break;

    case 'support-deductions':
      title = 'BIỂU MẪU KHẤU TRỪ HỖ TRỢ / PHỤC VỤ';
      headers = [
        'Đơn vị bị khấu trừ (Nhà thầu A) (*)',
        'Đơn vị thụ hưởng (Nhà thầu B) (*)',
        'Hạng mục khấu trừ (*)',
        'Nội dung chi tiết (*)',
        'Giá trị trước thuế (VNĐ)',
        'Giá trị sau thuế (VNĐ)',
        'Số HĐ bị khấu trừ (A)',
        'Số HĐ thanh toán (B)',
        'Đợt thanh toán khấu trừ',
        'Kỳ quyết toán khấu trừ',
        'Trạng thái (* - draft / processing / completed)'
      ];
      sampleData = [
        ['Công ty Xây dựng Delta', 'Công ty Điện nước Cơ điện M&E', 'Điện nước thi công', 'Khấu trừ tiền điện nước sinh hoạt tháng 6/2026', 15000000, 1650000, 'HĐ-Delta-01', '', 'Đợt 2', '', 'completed']
      ];
      break;

    case 'penalty-deductions':
      title = 'BIỂU MẪU QUYẾT ĐỊNH PHẠT VI PHẠM HĐ';
      headers = [
        'Số văn bản / Quyết định phạt (*)',
        'Ngày quyết định (YYYY-MM-DD) (*)',
        'Nội dung vi phạm (*)',
        'Tên nhà thầu bị phạt (*)',
        'Số hợp đồng bị phạt (*)',
        'Giá trị phạt (VNĐ)',
        'Đợt thanh toán khấu trừ phạt',
        'Kỳ quyết toán khấu trừ phạt',
        'Tình trạng phạt (* - draft / processing / completed)',
        'Ghi chú'
      ];
      sampleData = [
        ['QĐ-PHAT-2026-01', '2026-07-01', 'Vi phạm quy định an toàn lao động (Không đội mũ bảo hộ)', 'Công ty Xây dựng Delta', 'HĐ-Delta-01', 5000000, 'Đợt 2', '', 'completed', 'Ảnh đính kèm trong biên bản']
      ];
      break;

    case 'risks':
      title = 'BIỂU MẪU NHẬP RỦI RO CHI PHÍ';
      headers = [
        'Mô tả rủi ro (*)',
        'Khả năng xảy ra (* - high / medium / low)',
        'Mức độ ảnh hưởng (* - high / medium / low)',
        'Chi phí dự phòng (VNĐ)',
        'Trạng thái (* - active / mitigated)'
      ];
      sampleData = [
        ['Giá thép biến động tăng >10%', 'high', 'high', 500000000, 'active']
      ];
      break;

    case 'officers':
      title = 'BIỂU MẪU NHẬP DANH SÁCH CÁN BỘ';
      headers = [
        'Họ và tên (*)',
        'Chức vụ'
      ];
      sampleData = [
        ['Nguyễn Văn A', 'Trưởng Ban Quản lý Dự án'],
        ['Trần Thị B', 'Cán bộ kỹ thuật phụ trách QS']
      ];
      break;

    default:
      alert('Không nhận diện được loại dữ liệu.');
      return;
  }

  // 1. Tiêu đề bảng biểu
  sheet.mergeCells('A1:' + String.fromCharCode(64 + headers.length) + '1');
  const titleRow = sheet.getRow(1);
  titleRow.getCell(1).value = title;
  titleRow.height = 35;
  titleRow.getCell(1).font = { name: 'Times New Roman', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

  // 2. Tiêu đề cột (Headers)
  const headerRow = sheet.getRow(2);
  headerRow.height = 25;
  headers.forEach((h, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Times New Roman', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5597' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = borderStyle;
  });

  // 3. Dữ liệu mẫu (Sample data)
  sampleData.forEach((rowVal, rIdx) => {
    const row = sheet.getRow(rIdx + 3);
    row.height = 20;
    rowVal.forEach((val, cIdx) => {
      const cell = row.getCell(cIdx + 1);
      cell.value = val;
      cell.font = { name: 'Times New Roman', size: 12 };
      cell.border = borderStyle;
      if (typeof val === 'number') {
        cell.numFmt = '#,##0';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    });
  });

  // Tự động căn chỉnh độ rộng cột
  sheet.columns.forEach(col => {
    let maxLen = 0;
    col.eachCell({ includeEmpty: true }, cell => {
      if (cell.value) {
        const valStr = cell.value.toString();
        if (valStr.length > maxLen) maxLen = valStr.length;
      }
    });
    col.width = Math.max(maxLen + 4, 15);
  });

  // Xuất file
  workbook.xlsx.writeBuffer().then(buffer => {
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Mau_nhap_lieu_${type}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });
}

function importExcelFile(type, file) {
  const projectId = state.currentProjectId;
  if (!projectId || projectId === 'all') {
    alert("Vui lòng chọn một dự án cụ thể trước khi import dữ liệu.");
    return;
  }

  const proj = window.db.getProjectById(projectId);
  if (!proj) {
    alert("Không tìm thấy thông tin dự án.");
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const reader = new FileReader();
  reader.onload = function(evt) {
    const buffer = evt.target.result;
    workbook.xlsx.load(buffer).then(wb => {
      const sheet = wb.getWorksheet(1);
      if (!sheet) {
        alert("File Excel trống hoặc không đúng cấu trúc.");
        return;
      }

      let importCount = 0;
      let updateCount = 0;

      sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber < 3) return; // bỏ qua tiêu đề và cột tiêu đề

        const rowValues = [];
        for (let colIdx = 1; colIdx <= row.cellCount; colIdx++) {
          let val = row.getCell(colIdx).value;
          if (val && typeof val === 'object') {
            if (val.result !== undefined) val = val.result;
            else if (val.richText) val = val.richText.map(t => t.text).join('');
            else if (val.text) val = val.text;
          }
          rowValues.push(val);
        }

        if (rowValues.length === 0 || rowValues.every(v => v === null || v === undefined || v === '')) return;

        if (type === 'budgets') {
          const code = (rowValues[0] || '').toString().trim();
          const name = (rowValues[1] || '').toString().trim();
          let category = (rowValues[2] || '').toString().trim().toLowerCase();
          const amount = parseFloat(rowValues[3]) || 0;

          if (!code || !name) return;
          const validCats = ['gpmb', 'construction', 'equipment', 'qlda', 'consulting', 'other'];
          if (!validCats.includes(category)) category = 'other';

          const existing = proj.budgets.find(b => b.code === code);
          const budgetData = { code, name, category, amount };

          if (existing) {
            window.db.updateBudget(projectId, existing.id, budgetData);
            updateCount++;
          } else {
            window.db.addBudget(projectId, budgetData);
            importCount++;
          }
        }
        else if (type === 'bids') {
          const budgetCode = (rowValues[0] || '').toString().trim();
          const bidCode = (rowValues[1] || '').toString().trim();
          const name = (rowValues[2] || '').toString().trim();
          const estimateAmount = parseFloat(rowValues[3]) || 0;
          const bidAmount = parseFloat(rowValues[4]) || 0;
          const winner = (rowValues[5] || '').toString().trim();
          const handler = (rowValues[6] || '').toString().trim();
          let status = (rowValues[7] || '').toString().trim().toLowerCase();

          if (!bidCode || !name) return;
          const validStatus = ['planned', 'bidding', 'evaluated', 'awarded', 'cancelled'];
          if (!validStatus.includes(status)) status = 'planned';

          let budgetId = '';
          if (budgetCode) {
            const b = proj.budgets.find(item => item.code === budgetCode);
            if (b) budgetId = b.id;
          }

          const existing = proj.bids.find(b => b.code === bidCode);
          const bidData = { budgetId, code: bidCode, name, estimateAmount, bidAmount, winner, handler, status };

          if (existing) {
            window.db.updateBid(projectId, existing.id, bidData);
            updateCount++;
          } else {
            window.db.addBid(projectId, bidData);
            importCount++;
          }
        }
        else if (type === 'contracts') {
          const code = (rowValues[0] || '').toString().trim();
          const name = (rowValues[1] || '').toString().trim();
          const signingEntity = (rowValues[2] || '').toString().trim();
          const partner = (rowValues[3] || '').toString().trim();
          const contractType = (rowValues[4] || '').toString().trim().toLowerCase();
          const completionDate = (rowValues[5] || '').toString().trim();
          const value = parseFloat(rowValues[6]) || 0;
          const signedDate = (rowValues[7] || '').toString().trim();
          let status = (rowValues[8] || '').toString().trim().toLowerCase();

          if (!code || !name || !partner) return;
          const validTypes = ['lump-sum', 'fixed-unit-price', 'adjustable-unit-price'];
          const finalType = validTypes.includes(contractType) ? contractType : 'lump-sum';

          const validStatus = ['draft', 'active', 'completed', 'terminated'];
          if (!validStatus.includes(status)) status = 'active';

          const existing = proj.contracts.find(c => c.code === code);
          const contractData = { 
            code, name, signingEntity, partner, type: finalType, 
            completionDate, value, signedDate, status 
          };

          if (existing) {
            window.db.updateContract(projectId, existing.id, contractData);
            updateCount++;
          } else {
            window.db.addContract(projectId, contractData);
            importCount++;
          }
        }
        else if (type === 'variations') {
          const code = (rowValues[0] || '').toString().trim();
          const name = (rowValues[1] || '').toString().trim();
          const contractCode = (rowValues[2] || '').toString().trim();
          const requestAmount = parseFloat(rowValues[3]) || 0;
          const approvedAmount = parseFloat(rowValues[4]) || 0;
          const receiveDate = (rowValues[5] || '').toString().trim();
          const completeDate = (rowValues[6] || '').toString().trim();
          const handler = (rowValues[7] || '').toString().trim();
          let status = (rowValues[8] || '').toString().trim().toLowerCase();

          if (!code || !name || !contractCode) return;
          const validStatus = ['draft', 'processing', 'approved', 'rejected'];
          if (!validStatus.includes(status)) status = 'draft';

          const parentContract = proj.contracts.find(c => c.code === contractCode);
          if (!parentContract) return;

          const existing = proj.variations.find(v => v.code === code);
          const variationData = { 
            code, name, contractId: parentContract.id, requestAmount, 
            approvedAmount, receiveDate, completeDate, handler, status 
          };

          if (existing) {
            window.db.updateVariation(projectId, existing.id, variationData);
            updateCount++;
          } else {
            window.db.addVariation(projectId, variationData);
            importCount++;
          }
        }
        else if (type === 'payments') {
          const period = (rowValues[0] || '').toString().trim();
          const payType = (rowValues[1] || '').toString().trim().toLowerCase();
          const contractCode = (rowValues[2] || '').toString().trim();
          const receiveDate = (rowValues[3] || '').toString().trim();
          const completeDate = (rowValues[4] || '').toString().trim();
          const accountingTransferDate = (rowValues[5] || '').toString().trim();
          const handler = (rowValues[6] || '').toString().trim();
          const requestAmount = parseFloat(rowValues[7]) || 0;
          const completedAmount = parseFloat(rowValues[8]) || 0;
          const deductionAdvance = parseFloat(rowValues[9]) || 0;
          const deductionMaterial = parseFloat(rowValues[10]) || 0;
          const deductionElectricity = parseFloat(rowValues[11]) || 0;
          const deductionWater = parseFloat(rowValues[12]) || 0;
          const deductionPenalty = parseFloat(rowValues[13]) || 0;
          const deductionCross = parseFloat(rowValues[14]) || 0;
          const deductionOther = parseFloat(rowValues[15]) || 0;
          const retentionAmount = parseFloat(rowValues[16]) || 0;
          const paidDate = (rowValues[17] || '').toString().trim();
          const paidAmount = parseFloat(rowValues[18]) || 0;
          let status = (rowValues[19] || '').toString().trim().toLowerCase();

          if (!period || !payType || !contractCode) return;
          const validTypes = ['advance', 'payment', 'settlement'];
          const finalType = validTypes.includes(payType) ? payType : 'payment';

          const validStatus = ['draft', 'processing', 'paid', 'rejected'];
          if (!validStatus.includes(status)) status = 'draft';

          const parentContract = proj.contracts.find(c => c.code === contractCode);
          if (!parentContract) return;

          const existing = proj.payments.find(p => p.period === period && p.contractId === parentContract.id);
          const paymentData = {
            period, type: finalType, contractId: parentContract.id, receiveDate, completeDate,
            accountingTransferDate, handler, requestAmount, completedAmount, deductionAdvance,
            deductionMaterial, deductionElectricity, deductionWater, deductionPenalty, deductionCross,
            deductionOther, retentionAmount, paidDate, paidAmount, status
          };

          if (existing) {
            window.db.updatePayment(projectId, existing.id, paymentData);
            updateCount++;
          } else {
            window.db.addPayment(projectId, paymentData);
            importCount++;
          }
        }
        else if (type === 'materials') {
          const supplier = (rowValues[0] || '').toString().trim();
          const contractCode = (rowValues[1] || '').toString().trim();
          const name = (rowValues[2] || '').toString().trim();
          const unit = (rowValues[3] || '').toString().trim();
          const contractQty = parseFloat(rowValues[4]) || 0;
          const importQty = parseFloat(rowValues[5]) || 0;
          const importDate = (rowValues[6] || '').toString().trim();
          const receiptNo = (rowValues[7] || '').toString().trim();
          const deliveredQty = parseFloat(rowValues[8]) || 0;
          const deliveryDate = (rowValues[9] || '').toString().trim();
          const contractorName = (rowValues[10] || '').toString().trim();
          const returnedQty = parseFloat(rowValues[11]) || 0;
          const notes = (rowValues[12] || '').toString().trim();

          if (!supplier || !name || !unit) return;

          let contractId = '';
          if (contractCode) {
            const c = proj.contracts.find(item => item.code === contractCode);
            if (c) contractId = c.id;
          }

          const existing = proj.materials.find(m => m.name === name && m.supplier === supplier && m.contractId === contractId);
          const materialData = {
            supplier, contractId, name, unit, contractQty, importQty, importDate, receiptNo,
            deliveredQty, deliveryDate, contractorName, returnedQty, notes
          };

          if (existing) {
            window.db.updateMaterial(projectId, existing.id, materialData);
            updateCount++;
          } else {
            window.db.addMaterial(projectId, materialData);
            importCount++;
          }
        }
        else if (type === 'support-deductions') {
          const deductContractor = (rowValues[0] || '').toString().trim();
          const payContractor = (rowValues[1] || '').toString().trim();
          const category = (rowValues[2] || '').toString().trim();
          const content = (rowValues[3] || '').toString().trim();
          const amountBeforeTax = parseFloat(rowValues[4]) || 0;
          const amountAfterTax = parseFloat(rowValues[5]) || 0;
          const deductContractCode = (rowValues[6] || '').toString().trim();
          const payContractCode = (rowValues[7] || '').toString().trim();
          const paymentPeriod = (rowValues[8] || '').toString().trim();
          const settlementPeriod = (rowValues[9] || '').toString().trim();
          let status = (rowValues[10] || '').toString().trim().toLowerCase();

          if (!deductContractor || !payContractor || !category || !content) return;
          const validStatus = ['draft', 'processing', 'completed'];
          if (!validStatus.includes(status)) status = 'draft';

          let deductContractId = '';
          if (deductContractCode) {
            const c = proj.contracts.find(item => item.code === deductContractCode);
            if (c) deductContractId = c.id;
          }

          let payContractId = '';
          if (payContractCode) {
            const c = proj.contracts.find(item => item.code === payContractCode);
            if (c) payContractId = c.id;
          }

          const existing = proj.supportDeductions.find(sd => sd.content === content && sd.deductContractor === deductContractor);
          const sdData = {
            deductContractor, payContractor, category, content, amountBeforeTax, amountAfterTax,
            deductContractId, payContractId, paymentPeriod, settlementPeriod, status
          };

          if (existing) {
            window.db.updateSupportDeduction(projectId, existing.id, sdData);
            updateCount++;
          } else {
            window.db.addSupportDeduction(projectId, sdData);
            importCount++;
          }
        }
        else if (type === 'penalty-deductions') {
          const docNo = (rowValues[0] || '').toString().trim();
          const docDate = (rowValues[1] || '').toString().trim();
          const docContent = (rowValues[2] || '').toString().trim();
          const name = (rowValues[3] || '').toString().trim();
          const contractCode = (rowValues[4] || '').toString().trim();
          const amount = parseFloat(rowValues[5]) || 0;
          const paymentPeriod = (rowValues[6] || '').toString().trim();
          const settlementPeriod = (rowValues[7] || '').toString().trim();
          let status = (rowValues[8] || '').toString().trim().toLowerCase();
          const notes = (rowValues[9] || '').toString().trim();

          if (!docNo || !docDate || !docContent || !name || !contractCode) return;
          const validStatus = ['draft', 'processing', 'completed'];
          if (!validStatus.includes(status)) status = 'draft';

          const parentContract = proj.contracts.find(c => c.code === contractCode);
          if (!parentContract) return;

          const existing = proj.penaltyDeductions.find(pd => pd.docNo === docNo);
          const pdData = {
            docNo, docDate, docContent, name, contractId: parentContract.id, amount,
            paymentPeriod, settlementPeriod, status, attachment: notes
          };

          if (existing) {
            window.db.updatePenaltyDeduction(projectId, existing.id, pdData);
            updateCount++;
          } else {
            window.db.addPenaltyDeduction(projectId, pdData);
            importCount++;
          }
        }
        else if (type === 'risks') {
          const description = (rowValues[0] || '').toString().trim();
          let probability = (rowValues[1] || '').toString().trim().toLowerCase();
          let impact = (rowValues[2] || '').toString().trim().toLowerCase();
          const contingencyCost = parseFloat(rowValues[3]) || 0;
          let status = (rowValues[4] || '').toString().trim().toLowerCase();

          if (!description) return;
          const validProb = ['high', 'medium', 'low'];
          if (!validProb.includes(probability)) probability = 'medium';
          if (!validProb.includes(impact)) impact = 'medium';

          const validStatus = ['active', 'mitigated'];
          if (!validStatus.includes(status)) status = 'active';

          const existing = proj.risks.find(r => r.description === description);
          const riskData = { description, probability, impact, contingencyCost, status };

          if (existing) {
            window.db.updateRisk(projectId, existing.id, riskData);
            updateCount++;
          } else {
            window.db.addRisk(projectId, riskData);
            importCount++;
          }
        }
        else if (type === 'officers') {
          const name = (rowValues[0] || '').toString().trim();
          const position = (rowValues[1] || '').toString().trim();

          if (!name) return;

          const officers = window.db.getOfficers();
          const existing = officers.find(o => o.name === name);
          const officerData = { name, position };

          if (existing) {
            window.db.updateOfficer(existing.id, officerData);
            updateCount++;
          } else {
            window.db.addOfficer(officerData);
            importCount++;
          }
        }
      });

      alert(`Import thành công! Đã xử lý hết dữ liệu. Thêm mới: ${importCount} dòng, Cập nhật: ${updateCount} dòng.`);
      renderActiveTab();
      
      if (type === 'officers') {
        populateOfficerSelects();
      }
    }).catch(err => {
      console.error(err);
      alert(`Lỗi phân tích file Excel: ${err.message}`);
    });
  };
  reader.readAsArrayBuffer(file);
}

document.addEventListener('DOMContentLoaded', injectTodayButtons);


// --- QUẢN LÝ VẬT TƯ CĐT CẤP ---
function renderMaterialsTab() {
  const tableBody = document.getElementById('materials-list');
  if (!tableBody) return;
  tableBody.innerHTML = '';
  
  const isAll = state.currentProjectId === 'all';
  const projects = isAll ? window.db.getProjects() : [window.db.getProjectById(state.currentProjectId)];
  let allMaterials = [];
  
  projects.forEach(p => {
    if (p && p.materials) {
      p.materials.forEach(m => allMaterials.push({...m, projectName: p.name}));
    }
  });
  
  if (allMaterials.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="${isAll ? 17 : 16}" style="text-align: center; color: var(--text-dim); padding: 30px 0;">Không có dữ liệu vật tư.</td></tr>`;
    return;
  }
  
  allMaterials.forEach((m, index) => {
    const tr = document.createElement('tr');
    
    // contract name
    let contractName = 'N/A';
    projects.forEach(p => {
       if (p && p.contracts) {
          const c = p.contracts.find(c => c.id === m.contractId);
          if (c) contractName = c.code;
       }
    });

    const stock = (parseFloat(m.importQty) || 0) - (parseFloat(m.deliveredQty) || 0) + (parseFloat(m.returnedQty) || 0);

    let html = `<td>${index + 1}</td>`;
    if (isAll) {
      html += `<td class="col-project">${esc(m.projectName)}</td>`;
    } else {
      html += `<td class="col-project" style="display: none;">${esc(m.projectName)}</td>`;
    }
    
    html += `
      <td>${esc(m.supplier || '')}</td>
      <td>${contractName}</td>
      <td><strong>${esc(m.name || '')}</strong></td>
      <td>${esc(m.unit || '')}</td>
      <td style="text-align: right;">${formatCurrency(m.contractQty || 0)}</td>
      <td style="text-align: right; font-weight: bold; color: var(--color-primary);">${formatCurrency(m.importQty || 0)}</td>
      <td>${formatDate(m.importDate) || ''}</td>
      <td>${esc(m.receiptNo || '')}</td>
      <td style="text-align: right;">${formatCurrency(m.deliveredQty || 0)}</td>
      <td>${formatDate(m.deliveryDate) || ''}</td>
      <td>${m.contractorName || ''}</td>
      <td style="text-align: right;">${formatCurrency(m.returnedQty || 0)}</td>
      <td style="text-align: right; font-weight: bold; color: ${stock < 0 ? 'var(--color-danger)' : 'var(--color-success)'};">${formatCurrency(stock)}</td>
            <td>${m.attachmentName ? `<a href="#" style="color: var(--color-primary);"><i data-lucide="paperclip" style="width:14px;height:14px;margin-right:4px;"></i>File</a>` : ''}</td>
      <td>
        <button class="btn btn-secondary btn-sm btn-icon-only edit-material-btn" data-id="${m.id}"><i data-lucide="edit-2"></i></button>
        <button class="btn btn-danger btn-sm btn-icon-only delete-material-btn" data-id="${m.id}"><i data-lucide="trash-2"></i></button>
      </td>
    `;
    tr.innerHTML = html;
    tableBody.appendChild(tr);
  });
  
  document.querySelectorAll('.edit-material-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const mat = allMaterials.find(item => item.id === id);
      if (mat) openMaterialModal(mat);
    });
  });
  
  document.querySelectorAll('.delete-material-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      if (confirm('Bạn có chắc chắn muốn xóa vật tư này?')) {
        window.db.deleteMaterial(state.currentProjectId, id);
        renderMaterialsTab();
      }
    });
  });

  if (window.lucide) window.lucide.createIcons();
}

function openMaterialModal(mat = null) {
  if (state.currentProjectId === 'all') { alert('Vui lòng chọn 1 dự án cụ thể ở thanh trên cùng (không chọn Tất cả dự án) trước khi đăng ký/thêm mới.'); return; }
  const form = document.getElementById('form-material');
  if (!form) return;
  form.reset();
  
  const title = document.getElementById('modal-material-title');
  const idInput = document.getElementById('form-material-id');
  
  // Populate contract select
  const proj = window.db.getProjectById(state.currentProjectId);
  const contractSelect = document.getElementById('form-material-contract');
  contractSelect.innerHTML = '<option value="">-- Chọn Hợp đồng --</option>';
  if (proj && proj.contracts) {
     proj.contracts.forEach(c => {
       contractSelect.innerHTML += `<option value="${c.id}">${esc(c.code)} - ${esc(c.name)}</option>`;
     });
  }

  if (mat) {
    title.textContent = 'Cập nhật Vật tư';
    idInput.value = mat.id;
    document.getElementById('form-material-supplier').value = mat.supplier || '';
    document.getElementById('form-material-contract').value = mat.contractId || '';
    document.getElementById('form-material-name').value = mat.name || '';
    document.getElementById('form-material-unit').value = mat.unit || '';
    document.getElementById('form-material-contract-qty').value = formatVNNumber(mat.contractQty || '');
    document.getElementById('form-material-import-qty').value = formatVNNumber(mat.importQty || '');
    document.getElementById('form-material-import-date').value = mat.importDate || '';
    document.getElementById('form-material-receipt-no').value = mat.receiptNo || '';
    document.getElementById('form-material-delivered-qty').value = formatVNNumber(mat.deliveredQty || 0);
    document.getElementById('form-material-delivery-date').value = mat.deliveryDate || '';
    document.getElementById('form-material-contractor-name').value = mat.contractorName || '';
    document.getElementById('form-material-returned-qty').value = formatVNNumber(mat.returnedQty || 0);
        document.getElementById('form-material-attachment-name').value = mat.attachmentName || '';
    document.getElementById('form-material-attachment-data').value = mat.attachmentData || '';
  } else {
    title.textContent = 'Đăng ký Vật tư CĐT cấp';
    idInput.value = '';
    document.getElementById('form-material-attachment-name').value = '';
    document.getElementById('form-material-attachment-data').value = '';
  }
  
  openModal('modal-material');
}

function submitMaterialForm() {
  if (!document.getElementById('form-material').reportValidity()) return;
  const id = document.getElementById('form-material-id').value;
  const data = {
    supplier: document.getElementById('form-material-supplier').value.trim(),
    contractId: document.getElementById('form-material-contract').value,
    name: document.getElementById('form-material-name').value.trim(),
    unit: document.getElementById('form-material-unit').value.trim(),
    contractQty: parseVNNumber(document.getElementById('form-material-contract-qty').value),
    importQty: parseVNNumber(document.getElementById('form-material-import-qty').value),
    importDate: document.getElementById('form-material-import-date').value,
    receiptNo: document.getElementById('form-material-receipt-no').value.trim(),
    deliveredQty: parseVNNumber(document.getElementById('form-material-delivered-qty').value),
    deliveryDate: document.getElementById('form-material-delivery-date').value,
    contractorName: document.getElementById('form-material-contractor-name').value.trim(),
    returnedQty: parseVNNumber(document.getElementById('form-material-returned-qty').value),
    attachmentName: document.getElementById('form-material-attachment-name').value,
    attachmentData: document.getElementById('form-material-attachment-data').value
  };
  
  
  
  if (id) {
    window.db.updateMaterial(state.currentProjectId, id, data);
  } else {
    window.db.addMaterial(state.currentProjectId, data);
  }
  
  closeModal('modal-material');
  renderMaterialsTab();
}

// --- QUẢN LÝ KHẤU TRỪ HỖ TRỢ ---
function renderSupportDeductionsTab() {
  const tableBody = document.getElementById('support-deductions-list');
  if (!tableBody) return;
  tableBody.innerHTML = '';
  
  const isAll = state.currentProjectId === 'all';
  const projects = isAll ? window.db.getProjects() : [window.db.getProjectById(state.currentProjectId)];
  let allItems = [];
  
  projects.forEach(p => {
    if (p && p.supportDeductions) {
      p.supportDeductions.forEach(d => allItems.push({...d, projectName: p.name}));
    }
  });
  
  if (allItems.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="${isAll ? 15 : 14}" style="text-align: center; color: var(--text-dim); padding: 30px 0;">Không có dữ liệu khấu trừ.</td></tr>`;
    return;
  }
  
  allItems.forEach((d, index) => {
    const tr = document.createElement('tr');
    
    let deductContractName = 'N/A';
    let payContractName = 'N/A';
    projects.forEach(p => {
       if (p && p.contracts) {
          const dc = p.contracts.find(c => c.id === d.deductContractId);
          if (dc) deductContractName = dc.name;
          const pc = p.contracts.find(c => c.id === d.payContractId);
          if (pc) payContractName = pc.name;
       }
    });
    
    const statusMap = {
      'pending': '<span class="badge badge-warning">Chưa KT</span>',
      'processing': '<span class="badge badge-primary">Đang KT</span>',
      'completed': '<span class="badge badge-success">Đã KT</span>'
    };
    
    let html = `<td>${index + 1}</td>`;
    if (isAll) {
      html += `<td class="col-project">${esc(d.projectName)}</td>`;
    } else {
      html += `<td class="col-project" style="display: none;">${esc(d.projectName)}</td>`;
    }
    
    html += `
      <td><strong>${esc(d.deductContractor || '')}</strong></td>
      <td><strong>${esc(d.payContractor || '')}</strong></td>
      <td>${esc(d.category || '')}</td>
      <td>${esc(d.content || '')}</td>
      <td style="text-align: right;">${formatCurrency(d.amtBefore || 0)}</td>
      <td style="text-align: right; color: var(--color-danger); font-weight: bold;">${formatCurrency(d.amtAfter || 0)}</td>
      <td>${deductContractName}</td>
      <td>${payContractName}</td>
      <td>${esc(d.period || '')}</td>
      <td>${d.settlement || ''}</td>
      <td>${statusMap[d.status] || d.status || ''}</td>
      <td>${d.attachmentName ? `<a href="#" style="color: var(--color-primary);"><i data-lucide="paperclip" style="width:14px;height:14px;margin-right:4px;"></i>File</a>` : ''}</td>
      <td>
        <button class="btn btn-secondary btn-sm btn-icon-only edit-sd-btn" data-id="${d.id}"><i data-lucide="edit-2"></i></button>
        <button class="btn btn-danger btn-sm btn-icon-only delete-sd-btn" data-id="${d.id}"><i data-lucide="trash-2"></i></button>
      </td>
    `;
    tr.innerHTML = html;
    tableBody.appendChild(tr);
  });
  
  document.querySelectorAll('.edit-sd-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const d = allItems.find(item => item.id === id);
      if (d) openSupportDeductionModal(d);
    });
  });
  
  document.querySelectorAll('.delete-sd-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      if (confirm('Bạn có chắc chắn muốn xóa dữ liệu này?')) {
        window.db.deleteSupportDeduction(state.currentProjectId, id);
        renderSupportDeductionsTab();
      }
    });
  });

  if (window.lucide) window.lucide.createIcons();
}

function openSupportDeductionModal(d = null) {
  if (state.currentProjectId === 'all') { alert('Vui lòng chọn 1 dự án cụ thể ở thanh trên cùng (không chọn Tất cả dự án) trước khi đăng ký/thêm mới.'); return; }
  const form = document.getElementById('form-support-deduction');
  if (!form) return;
  form.reset();
  
  const title = document.getElementById('modal-support-deduction-title');
  const idInput = document.getElementById('form-support-deduction-id');
  
  // Populate contract select
  const proj = window.db.getProjectById(state.currentProjectId);
  const dcSelect = document.getElementById('form-support-deduction-deduct-contract');
  const pcSelect = document.getElementById('form-support-deduction-pay-contract');
  
  let options = '<option value="">-- Chọn Hợp đồng --</option>';
  if (proj && proj.contracts) {
     proj.contracts.forEach(c => {
       options += `<option value="${c.id}">${esc(c.name)}</option>`;
     });
  }
  dcSelect.innerHTML = options;
  pcSelect.innerHTML = options;

  if (d) {
    title.textContent = 'Cập nhật Khấu trừ';
    idInput.value = d.id;
    document.getElementById('form-support-deduction-deduct-contractor').value = d.deductContractor || '';
    document.getElementById('form-support-deduction-pay-contractor').value = d.payContractor || '';
    document.getElementById('form-support-deduction-deduct-contract').value = d.deductContractId || '';
    document.getElementById('form-support-deduction-pay-contract').value = d.payContractId || '';
    document.getElementById('form-support-deduction-category').value = d.category || '';
    document.getElementById('form-support-deduction-status').value = d.status || 'pending';
    document.getElementById('form-support-deduction-amt-before').value = formatVNNumber(d.amtBefore || '');
    document.getElementById('form-support-deduction-amt-after').value = formatVNNumber(d.amtAfter || '');
    document.getElementById('form-support-deduction-period').value = d.period || '';
    document.getElementById('form-support-deduction-settlement').value = d.settlement || '';
    document.getElementById('form-support-deduction-content').value = d.content || '';
    document.getElementById('form-support-deduction-attachment-name').value = d.attachmentName || '';
    document.getElementById('form-support-deduction-attachment-data').value = d.attachmentData || '';
  } else {
    title.textContent = 'Đăng ký Khấu trừ Hỗ trợ';
    idInput.value = '';
    document.getElementById('form-support-deduction-attachment-name').value = '';
    document.getElementById('form-support-deduction-attachment-data').value = '';
  }
  
  openModal('modal-support-deduction');
}

function submitSupportDeductionForm() {
  if (!document.getElementById('form-support-deduction').reportValidity()) return;
  const id = document.getElementById('form-support-deduction-id').value;
  const data = {
    deductContractor: document.getElementById('form-support-deduction-deduct-contractor').value.trim(),
    payContractor: document.getElementById('form-support-deduction-pay-contractor').value.trim(),
    deductContractId: document.getElementById('form-support-deduction-deduct-contract').value,
    payContractId: document.getElementById('form-support-deduction-pay-contract').value,
    category: document.getElementById('form-support-deduction-category').value.trim(),
    status: document.getElementById('form-support-deduction-status').value,
    amtBefore: parseVNNumber(document.getElementById('form-support-deduction-amt-before').value),
    amtAfter: parseVNNumber(document.getElementById('form-support-deduction-amt-after').value),
    period: document.getElementById('form-support-deduction-period').value.trim(),
    settlement: document.getElementById('form-support-deduction-settlement').value.trim(),
    content: document.getElementById('form-support-deduction-content').value.trim(),
    attachmentName: document.getElementById('form-support-deduction-attachment-name').value,
    attachmentData: document.getElementById('form-support-deduction-attachment-data').value
  };
  
  
  
  if (id) {
    window.db.updateSupportDeduction(state.currentProjectId, id, data);
  } else {
    window.db.addSupportDeduction(state.currentProjectId, data);
  }
  
  closeModal('modal-support-deduction');
  renderSupportDeductionsTab();
}

// --- QUẢN LÝ KHẤU TRỪ PHẠT VI PHẠM ---
function renderPenaltyDeductionsTab() {
  const tableBody = document.getElementById('penalty-deductions-list');
  if (!tableBody) return;
  tableBody.innerHTML = '';
  
  const isAll = state.currentProjectId === 'all';
  const projects = isAll ? window.db.getProjects() : [window.db.getProjectById(state.currentProjectId)];
  let allItems = [];
  
  projects.forEach(p => {
    if (p && p.penaltyDeductions) {
      p.penaltyDeductions.forEach(d => allItems.push({...d, projectName: p.name}));
    }
  });
  
  if (allItems.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="${isAll ? 13 : 12}" style="text-align: center; color: var(--text-dim); padding: 30px 0;">Không có dữ liệu phạt vi phạm.</td></tr>`;
    return;
  }
  
  allItems.forEach((d, index) => {
    const tr = document.createElement('tr');
    
    let contractName = 'N/A';
    projects.forEach(p => {
       if (p && p.contracts) {
          const c = p.contracts.find(c => c.id === d.contractId);
          if (c) contractName = c.name;
       }
    });
    
    const statusMap = {
      'pending': '<span class="badge badge-warning">Chưa KT</span>',
      'processing': '<span class="badge badge-primary">Đang KT</span>',
      'completed': '<span class="badge badge-success">Đã KT</span>'
    };
    
    let html = `<td>${index + 1}</td>`;
    if (isAll) {
      html += `<td class="col-project">${esc(d.projectName)}</td>`;
    } else {
      html += `<td class="col-project" style="display: none;">${esc(d.projectName)}</td>`;
    }
    
    html += `
      <td><strong>${esc(d.docNo || '')}</strong></td>
      <td>${formatDate(d.docDate) || ''}</td>
      <td>${esc(d.docContent || '')}</td>
      <td><strong>${esc(d.name || '')}</strong></td>
      <td>${contractName}</td>
      <td style="text-align: right; color: var(--color-danger); font-weight: bold;">${formatCurrency(d.amount || 0)}</td>
      <td>${d.paymentPeriod || ''}</td>
      <td>${d.settlementPeriod || ''}</td>
      <td>${statusMap[d.status] || d.status || ''}</td>
      <td>${d.attachmentName ? `<a href="#" style="color: var(--color-primary);"><i data-lucide="paperclip" style="width:14px;height:14px;margin-right:4px;"></i>File</a>` : ''}</td>
      <td>
        <button class="btn btn-secondary btn-sm btn-icon-only edit-pd-btn" data-id="${d.id}"><i data-lucide="edit-2"></i></button>
        <button class="btn btn-danger btn-sm btn-icon-only delete-pd-btn" data-id="${d.id}"><i data-lucide="trash-2"></i></button>
      </td>
    `;
    tr.innerHTML = html;
    tableBody.appendChild(tr);
  });
  
  document.querySelectorAll('.edit-pd-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const d = allItems.find(item => item.id === id);
      if (d) openPenaltyDeductionModal(d);
    });
  });
  
  document.querySelectorAll('.delete-pd-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      if (confirm('Bạn có chắc chắn muốn xóa dữ liệu này?')) {
        window.db.deletePenaltyDeduction(state.currentProjectId, id);
        renderPenaltyDeductionsTab();
      }
    });
  });

  if (window.lucide) window.lucide.createIcons();
}

function openPenaltyDeductionModal(d = null) {
  if (state.currentProjectId === 'all') { alert('Vui lòng chọn 1 dự án cụ thể ở thanh trên cùng (không chọn Tất cả dự án) trước khi đăng ký/thêm mới.'); return; }
  const form = document.getElementById('form-penalty-deduction');
  if (!form) return;
  form.reset();
  
  const title = document.getElementById('modal-penalty-deduction-title');
  const idInput = document.getElementById('form-penalty-deduction-id');
  
  // Populate contract select
  const proj = window.db.getProjectById(state.currentProjectId);
  const cSelect = document.getElementById('form-penalty-deduction-contract');
  
  let options = '<option value="">-- Chọn Hợp đồng --</option>';
  if (proj && proj.contracts) {
     proj.contracts.forEach(c => {
       options += `<option value="${c.id}">${esc(c.name)}</option>`;
     });
  }
  cSelect.innerHTML = options;

  if (d) {
    title.textContent = 'Cập nhật Phạt';
    idInput.value = d.id;
    document.getElementById('form-penalty-deduction-doc-no').value = d.docNo || '';
    document.getElementById('form-penalty-deduction-doc-date').value = d.docDate || '';
    document.getElementById('form-penalty-deduction-doc-content').value = d.docContent || '';
    document.getElementById('form-penalty-deduction-name').value = d.name || '';
    document.getElementById('form-penalty-deduction-contract').value = d.contractId || '';
    document.getElementById('form-penalty-deduction-amount').value = formatVNNumber(d.amount || '');
    document.getElementById('form-penalty-deduction-status').value = d.status || 'pending';
    document.getElementById('form-penalty-deduction-payment-period').value = d.paymentPeriod || '';
    document.getElementById('form-penalty-deduction-settlement-period').value = d.settlementPeriod || '';
    // Fix ID discrepancy
    if(document.getElementById('form-penalty-deduction-attachment')) {
      document.getElementById('form-penalty-deduction-attachment').value = d.attachmentName || '';
    }
    if(document.getElementById('form-penalty-deduction-attachment-name')) {
      document.getElementById('form-penalty-deduction-attachment-name').value = d.attachmentName || '';
    }
    document.getElementById('form-penalty-deduction-attachment-data').value = d.attachmentData || '';
  } else {
    title.textContent = 'Đăng ký Phạt vi phạm';
    idInput.value = '';
    if(document.getElementById('form-penalty-deduction-attachment')) {
      document.getElementById('form-penalty-deduction-attachment').value = '';
    }
    if(document.getElementById('form-penalty-deduction-attachment-name')) {
      document.getElementById('form-penalty-deduction-attachment-name').value = '';
    }
    document.getElementById('form-penalty-deduction-attachment-data').value = '';
  }
  
  openModal('modal-penalty-deduction');
}

function submitPenaltyDeductionForm() {
  if (!document.getElementById('form-penalty-deduction').reportValidity()) return;
  const id = document.getElementById('form-penalty-deduction-id').value;
  const attachNameEl = document.getElementById('form-penalty-deduction-attachment-name') || document.getElementById('form-penalty-deduction-attachment');
  const data = {
    docNo: document.getElementById('form-penalty-deduction-doc-no').value.trim(),
    docDate: document.getElementById('form-penalty-deduction-doc-date').value,
    docContent: document.getElementById('form-penalty-deduction-doc-content').value.trim(),
    name: document.getElementById('form-penalty-deduction-name').value.trim(),
    contractId: document.getElementById('form-penalty-deduction-contract').value,
    amount: parseVNNumber(document.getElementById('form-penalty-deduction-amount').value),
    status: document.getElementById('form-penalty-deduction-status').value,
    paymentPeriod: document.getElementById('form-penalty-deduction-payment-period').value.trim(),
    settlementPeriod: document.getElementById('form-penalty-deduction-settlement-period').value.trim(),
    attachmentName: attachNameEl ? attachNameEl.value : '',
    attachmentData: document.getElementById('form-penalty-deduction-attachment-data').value
  };
  
  
  
  if (id) {
    window.db.updatePenaltyDeduction(state.currentProjectId, id, data);
  } else {
    window.db.addPenaltyDeduction(state.currentProjectId, data);
  }
  
  closeModal('modal-penalty-deduction');
  renderPenaltyDeductionsTab();
}


function injectTodayButtons() {
  const buttons = document.querySelectorAll('.btn-today');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      if (targetId) {
        const input = document.getElementById(targetId);
        if (input) {
          const today = new Date();
          const yyyy = today.getFullYear();
          const mm = String(today.getMonth() + 1).padStart(2, '0');
          const dd = String(today.getDate()).padStart(2, '0');
          input.value = `${yyyy}-${mm}-${dd}`;
        }
      }
    });
  });
}
