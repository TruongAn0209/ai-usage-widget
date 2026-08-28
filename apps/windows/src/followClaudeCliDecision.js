// Ham thuan (khong dung Electron) quyet dinh widget nen an/hien khi bat followClaudeCli.
// Tach rieng khoi main.js de kiem thu duoc ca 3 trang thai (hien/an/hien lai) VA 2 rang buoc
// bat buoc cua yeu cau: khong vong lap an/hien, va thao tac an thu cong bang hotkey khong bi
// watcher tu dong hien lai ngoai y muon.
//
// autoHiddenByWatcher = true CHI KHI lan an gan nhat la do chinh watcher nay gay ra. An thu cong
// (hotkey/khay) phai duoc goi noi xoa co nay VE FALSE truoc khi goi decide â€” do la lam o main.js,
// khong phai o day.
//
// wasActiveBefore = Claude co dang hoat dong (shouldShow) o lan kiem tra TRUOC do khong. Dung de
// phat hien mot CHU KY dong/mo that su: neu Claude vua tu khong hoat dong chuyen sang hoat dong,
// bat ke an tay hay an do watcher, widget van phai hien lai â€” khong duoc ket "an tay" vinh vien
// chi vi lo bam hotkey mot lan roi quen. An tay chi "dinh" trong CUNG mot phien Claude dang chay.
function decideFollowClaudeCli({
  followClaudeCli,
  claude,
  terminalState,
  isVisible,
  autoHiddenByWatcher,
  wasActiveBefore = true,
}) {
  if (!followClaudeCli) {
    // Khi follow tat, luon khoi phuc widget neu dang hidden.
    if (!isVisible || autoHiddenByWatcher) return { action: 'show', autoHiddenByWatcher: false, activeNow: false };
    return { action: 'none', autoHiddenByWatcher: false, activeNow: false };
  }
  // Script do trang thai that bai -> khong doan mo, giu nguyen hien trang (tranh an oan vi loi
  // moi truong thoang qua).
  if (terminalState === 'error') return { action: 'none', autoHiddenByWatcher, activeNow: wasActiveBefore };

  const shouldShow = !!claude && terminalState === 'visible';
  const reactivatedAfterClose = shouldShow && !wasActiveBefore;

  // Mot chu ky dong/mo that su -> xoa moi uc che an tay cu, hien lai ngay.
  if (reactivatedAfterClose && !isVisible) {
    return { action: 'show', autoHiddenByWatcher: false, activeNow: true };
  }
  if (!shouldShow && isVisible) return { action: 'hide', autoHiddenByWatcher: true, activeNow: shouldShow };
  // CHI tu dong hien lai neu lan an gan nhat la do watcher (autoHiddenByWatcher true). An bang
  // tay thi co nay da bi main.js xoa ve false truoc do -> nhanh nay khong khop -> khong hien lai
  // (tru khi vua reactivatedAfterClose o tren).
  if (shouldShow && autoHiddenByWatcher) return { action: 'show', autoHiddenByWatcher: false, activeNow: shouldShow };
  return { action: 'none', autoHiddenByWatcher, activeNow: shouldShow };
}

module.exports = { decideFollowClaudeCli };

