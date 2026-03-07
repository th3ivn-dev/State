// Перевірити, чи є користувач адміном
function isAdmin(userId, adminIds, ownerId = null) {
  const userIdStr = String(userId);

  if (ownerId && String(ownerId) === userIdStr) {
    return true;
  }

  if (!adminIds || !Array.isArray(adminIds)) {
    return false;
  }

  return adminIds.some(adminId => String(adminId) === userIdStr);
}

module.exports = {
  isAdmin,
};
