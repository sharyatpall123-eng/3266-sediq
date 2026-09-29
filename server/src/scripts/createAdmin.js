import { assertDatabase, supabaseAdmin } from "../config/supabase.js";

const args = process.argv.slice(2);
const readArg = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : "";
};

const email = readArg("email");
const password = readArg("password");
const username = readArg("username") || "admin";
const fullName = readArg("name") || "Administrator";

if (!email || !password || password.length < 8) {
  console.error('Usage: npm run create:admin -- --email admin@example.com --password StrongPass123 --username admin --name "Administrator"');
  process.exit(1);
}

try {
  assertDatabase();
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, full_name: fullName },
  });
  if (error) throw error;

  const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
    id: data.user.id,
    email,
    username,
    full_name: fullName,
    role: "administrator",
    is_active: true,
  });
  if (profileError) throw profileError;

  console.log(`Administrator created: ${username} (${email})`);
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
