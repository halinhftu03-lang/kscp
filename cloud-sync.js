/**
 * cloud-sync.js — Lớp đồng bộ dữ liệu dùng chung real-time qua Firebase Firestore.
 *
 * CÁCH HOẠT ĐỘNG:
 *  - localStorage vẫn là kho làm việc chính (app đọc/ghi như cũ, chạy được cả khi mất mạng).
 *  - Mỗi lần dữ liệu thay đổi -> đẩy toàn bộ lên 1 document chung trên Firestore.
 *  - Khi người khác thay đổi -> tự kéo về, ghi vào localStorage và làm mới giao diện.
 *
 * CÁCH BẬT (làm 1 lần):
 *  1) Tạo project miễn phí tại https://console.firebase.google.com -> bật Firestore Database.
 *  2) Vào Project settings -> mục "Your apps" -> tạo Web app -> copy đối tượng firebaseConfig.
 *  3) Dán các giá trị vào CLOUD_CONFIG.firebase bên dưới rồi lưu file.
 *  Khi apiKey còn trống, app tự chạy ở chế độ lưu cục bộ (không đồng bộ) — không lỗi.
 *
 * LƯU Ý: mô hình này dùng "ghi sau đè ghi trước" (last-write-wins) trên toàn bộ dữ liệu.
 * Phù hợp cho ban nhỏ, chủ yếu 1-2 người nhập liệu. Vẫn nên bấm "Sao lưu" định kỳ.
 */

const CLOUD_CONFIG = {
  firebase: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  },
  // Định danh kho dữ liệu dùng chung của ban (mọi người phải giống nhau)
  docId: "kscp-ban-chung"
};

(function initCloudSync() {
  if (!CLOUD_CONFIG.firebase.apiKey) {
    console.log("[CloudSync] Chưa cấu hình đám mây — chạy chế độ lưu cục bộ (localStorage).");
    return;
  }
  if (typeof firebase === "undefined" || !firebase.firestore) {
    console.error("[CloudSync] Chưa nạp được thư viện Firebase. Kiểm tra kết nối mạng hoặc thẻ <script> Firebase trong index.html.");
    return;
  }

  let docRef;
  try {
    firebase.initializeApp(CLOUD_CONFIG.firebase);
    docRef = firebase.firestore().collection("kscp").doc(CLOUD_CONFIG.docId);
  } catch (e) {
    console.error("[CloudSync] Lỗi khởi tạo Firebase:", e);
    return;
  }

  const banner = showStatus("Đang kết nối dữ liệu dùng chung…", "#f59e0b");

  // Giữ tham chiếu tới saveData gốc (chỉ ghi localStorage, không đẩy lên mây)
  const origSave = window.db.saveData.bind(window.db);
  let applyingRemote = false;
  let pushTimer = null;

  // 1) Chặn saveData: ghi localStorage như cũ, rồi đẩy lên mây (gộp trong 800ms)
  window.db.saveData = function (data) {
    origSave(data);
    if (applyingRemote) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      docRef
        .set({ payload: JSON.stringify(data), updatedAt: Date.now() })
        .catch((e) => {
          console.error("[CloudSync] Lỗi đẩy dữ liệu lên mây:", e);
          showStatus("Lỗi đồng bộ lên mây — dữ liệu vẫn được lưu cục bộ.", "#ef4444");
        });
    }, 800);
  };

  // 2) Lắng nghe thay đổi real-time từ người dùng khác
  docRef.onSnapshot(
    (snap) => {
      if (!snap.exists) {
        // Lần đầu: đưa dữ liệu cục bộ hiện tại lên làm dữ liệu gốc dùng chung
        docRef.set({ payload: JSON.stringify(window.db.getData()), updatedAt: Date.now() });
        setStatus(banner, "Đã tạo kho dữ liệu dùng chung.", "#22c55e", true);
        return;
      }
      // Bỏ qua tín hiệu phản hồi từ chính lần ghi của mình
      if (snap.metadata.hasPendingWrites) return;

      try {
        const remote = snap.data();
        const data = JSON.parse(remote.payload);
        applyingRemote = true;
        origSave(data);
        applyingRemote = false;
        refreshUI();
        const when = remote.updatedAt ? new Date(remote.updatedAt).toLocaleTimeString("vi-VN") : "";
        setStatus(banner, "Đã đồng bộ dữ liệu dùng chung" + (when ? " lúc " + when : ""), "#22c55e", true);
      } catch (e) {
        applyingRemote = false;
        console.error("[CloudSync] Lỗi đọc dữ liệu từ mây:", e);
      }
    },
    (err) => {
      console.error("[CloudSync] Mất kết nối tới Firestore:", err);
      showStatus("Mất kết nối dữ liệu dùng chung — đang dùng bản cục bộ.", "#ef4444");
    }
  );

  // Làm mới giao diện sau khi nhận dữ liệu mới
  function refreshUI() {
    try {
      if (typeof populateProjectSelector === "function") populateProjectSelector();
      const sel = document.getElementById("global-project-select");
      if (sel && window.state) {
        const stillExists =
          window.state.currentProjectId === "all" ||
          (window.db.getProjectById && window.db.getProjectById(window.state.currentProjectId));
        if (!stillExists) window.state.currentProjectId = "all";
        sel.value = window.state.currentProjectId;
      }
      if (typeof renderActiveTab === "function") renderActiveTab();
    } catch (e) {
      console.error("[CloudSync] Lỗi làm mới giao diện:", e);
    }
  }

  // Dải thông báo trạng thái nhỏ ở góc phải dưới
  function showStatus(text, color) {
    let el = document.getElementById("cloud-sync-status");
    if (!el) {
      el = document.createElement("div");
      el.id = "cloud-sync-status";
      el.style.cssText =
        "position:fixed;right:16px;bottom:16px;z-index:9999;padding:8px 14px;border-radius:8px;" +
        "font-size:13px;font-weight:600;color:#fff;box-shadow:0 4px 16px rgba(0,0,0,.3);" +
        "font-family:system-ui,sans-serif;transition:opacity .4s;opacity:1;";
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.background = color;
    el.style.opacity = "1";
    return el;
  }
  function setStatus(el, text, color, autoHide) {
    if (!el) return;
    el.textContent = text;
    el.style.background = color;
    el.style.opacity = "1";
    if (autoHide) setTimeout(() => (el.style.opacity = "0"), 2500);
  }
})();
