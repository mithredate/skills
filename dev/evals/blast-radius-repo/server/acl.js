const roles = require('../data/roles.json');
const { PERMISSION_GROUPS } = require('../shared/permissions');

function permissionsOf(roleName) {
  const role = roles[roleName];
  if (!role) return new Set();
  const groups = role.groups.includes('*') ? Object.keys(PERMISSION_GROUPS) : role.groups;
  return new Set([...role.permissions, ...groups.flatMap((group) => PERMISSION_GROUPS[group])]);
}

function can(user, permission) {
  return user.roles.some((roleName) => permissionsOf(roleName).has(permission));
}

module.exports = { permissionsOf, can };
