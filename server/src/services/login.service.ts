function requiredUsers(): Array<{ subject: string; username: string; password: string; name: string }> {
  const raw = process.env.AUTH_USERS;
  if (!raw) {
    // Default demo user if none configured (log a warning)
    console.warn("AUTH_USERS not set. Using default demo user admin:password. Set AUTH_USERS=subject:username:password:name;subject2:...");
    return [{ subject: "admin", username: "admin", password: "password", name: "Administrator" }];
  }
  return raw.split(";").map((entry) => {
    const [subject, username, password, name] = entry.split(":");
    return { subject, username, password, name };
  });
}

const users = requiredUsers();

export class LoginService {
  async validateUser(username: string, password: string) {
    const user = users.find(
      (u) => u.username === username && u.password === password
    );
    if (!user) return null;
    return { subject: user.subject, name: user.name };
  }
}
