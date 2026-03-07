// Перевірити, чи є користувач адміном
function isAdmin(userId, adminIds, ownerId = null) {
  const userIdStr = String(userId);

  // Check if user is the owner first (owner has all admin rights)
  if (ownerId && userIdStr === String(ownerId)) {
    return true;
  }

  // Check if user is in admin list
  return adminIds.includes(userIdStr);
}

module.exports = { isAdmin };
