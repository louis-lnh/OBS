const roleRank = {
  viewer: 0,
  subscriber: 1,
  vip: 2,
  moderator: 3,
  admin: 4,
  owner: 5
};

export function getUserRole(message, config) {
  const username = message.username.toLowerCase();
  const badges = new Set((message.badges ?? []).map((badge) => badge.set_id ?? badge));

  if (config.owners.includes(username) || badges.has("broadcaster")) return "owner";
  if (config.admins.includes(username)) return "admin";
  if (config.moderators.includes(username) || badges.has("moderator")) {
    return "moderator";
  }
  if (badges.has("vip")) return "vip";
  if (badges.has("subscriber")) return "subscriber";
  return "viewer";
}

export function hasPermission(userRole, neededRole = "viewer") {
  return (roleRank[userRole] ?? 0) >= (roleRank[neededRole] ?? 0);
}
