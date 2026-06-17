import { rubyString } from "../utils.ts";

export function serviceFromOptions(options: any = {}, fallbackName = "") {
  if (options.service === false) return null;

  if (options.service || options.serviceCommand) {
    return normalizeServiceConfig(
      {
        command: options.serviceCommand,
        keepAlive: options.serviceKeepAlive,
      },
      fallbackName,
    );
  }

  return normalizeServiceConfig(options.serviceConfig, fallbackName);
}

export function normalizeServiceConfig(config: any, fallbackName = "") {
  if (!config) return null;

  const command = String(config.command || fallbackName || "").trim();
  if (!command) return null;

  return {
    command,
    keepAlive: config.keepAlive !== false,
    workingDir: config.workingDir || null,
    logPath: config.logPath || null,
    errorLogPath: config.errorLogPath || null,
  };
}

export function buildServiceBlock(serviceConfig: any, fallbackName = "") {
  const service = normalizeServiceConfig(serviceConfig, fallbackName);
  if (!service) return "";

  let ruby = `  service do\n`;
  ruby += `    run ${rubyRunCommand(service.command, fallbackName)}\n`;
  if (service.keepAlive) ruby += `    keep_alive true\n`;
  if (service.workingDir)
    ruby += `    working_dir ${rubyString(service.workingDir)}\n`;
  if (service.logPath) ruby += `    log_path ${rubyString(service.logPath)}\n`;
  if (service.errorLogPath)
    ruby += `    error_log_path ${rubyString(service.errorLogPath)}\n`;
  ruby += `  end\n\n`;
  return ruby;
}

function rubyRunCommand(command: string, fallbackName: string) {
  const parts = splitCommand(command);
  const executable = parts[0] || fallbackName;
  const args = parts.slice(1);

  if (isFormulaExecutable(executable, fallbackName)) {
    const executableName = executable.split("/").pop();
    if (args.length === 0) return `opt_bin/${rubyString(executableName)}`;

    return `[opt_bin/${rubyString(executableName)}, ${args.map(rubyString).join(", ")}]`;
  }

  if (args.length === 0) return rubyString(command);
  return `[${parts.map(rubyString).join(", ")}]`;
}

function isFormulaExecutable(executable: string, fallbackName: string) {
  const base = executable.split("/").pop();
  return (
    base === fallbackName ||
    executable === `bin/${fallbackName}` ||
    executable === `./${fallbackName}`
  );
}

function splitCommand(command: string) {
  const parts = [];
  let current = "";
  let quote = null;
  let escaping = false;

  for (const char of command.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) parts.push(current);
  return parts;
}
