import express from 'express';
import cors from 'cors';
import axios from 'axios';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Защита от спама
const requestCounts = new Map();
const MAX_REQUESTS_PER_HOUR = 100;

// Главная страница
app.get('/', (req, res) => {
  res.json({
    message: "Kotlin Compiler Server is running!",
    version: "1.0.1",
    endpoint: "/compile"
  });
});

// Эндпоинт компиляции
app.post('/compile', async (req, res) => {
  const ip = req.ip || 'unknown';
  const count = (requestCounts.get(ip) || 0) + 1;
  
  if (count > MAX_REQUESTS_PER_HOUR) {
    return res.status(429).json({ 
      success: false,
      error: 'Слишком много запросов. Попробуйте через час.'
    });
  }
  requestCounts.set(ip, count);
  setTimeout(() => requestCounts.set(ip, count - 1), 3600000);

  try {
    const { code } = req.body;
    
    if (!code || code.trim().length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Код не предоставлен'
      });
    }
    
    if (code.length > 5000) {
      return res.status(400).json({ 
        success: false,
        error: 'Код слишком длинный (максимум 5000 символов)'
      });
    }

    // ИСПРАВЛЕНИЕ: Гарантированно правильный формат для JDoodle
    const fixedCode = fixKotlinCodeForJDoodle(code);
    
    console.log(`📤 Отправленный в JDoodle код (от ${ip}):`);
    console.log('---');
    console.log(fixedCode);
    console.log('---');

    // Отправка в JDoodle с явным указанием версии Kotlin 1.8.0
    const response = await axios.post(
      'https://api.jdoodle.com/v1/execute',
      {
        script: fixedCode,
        language: 'kotlin',
        versionIndex: '0', // Kotlin 1.8.0 — самая стабильная версия
        clientId: process.env.JDOODLE_CLIENT_ID,
        clientSecret: process.env.JDOODLE_CLIENT_SECRET
      },
      { timeout: 15000 }
    );

    const jdoodleResult = response.data;
    console.log(`✅ Ответ JDoodle: statusCode=${jdoodleResult.statusCode}, output length=${jdoodleResult.output?.length || 0}`);

    // ВСЕГДА возвращаем полный ответ, даже если есть ошибки компиляции
    res.json({
      success: jdoodleResult.statusCode === 200,
      output: jdoodleResult.output || 'Нет вывода',
      statusCode: jdoodleResult.statusCode,
      cpuTime: jdoodleResult.cpuTime || '0.00',
      memory: jdoodleResult.memory
    });

  } catch (error) {
    console.error('❌ Ошибка при обращении к JDoodle:', error.message);
    
    if (error.response) {
      console.error('Данные ошибки от JDoodle:', error.response.data);
      return res.status(400).json({
        success: false,
        error: 'Ошибка компиляции',
        details: error.response.data
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Внутренняя ошибка сервера: ' + error.message
    });
  }
});

// 🔑 КЛЮЧЕВАЯ ФУНКЦИЯ: Гарантированно правильный формат для JDoodle
function fixKotlinCodeForJDoodle(rawCode) {
  // Шаг 1: Удаляем ВСЕ объявления package
  let code = rawCode.trim().replace(/^package\s+[^\n]+/gm, '').trim();
  
  // Шаг 2: Удаляем многострочные комментарии в начале (могут мешать)
  code = code.replace(/^\/\*[\s\S]*?\*\//m, '').trim();
  
  // Шаг 3: Удаляем однострочные комментарии в начале
  code = code.replace(/^\/\/[^\n]*\n/gm, '').trim();
  
  // Шаг 4: Проверяем наличие ПРАВИЛЬНОГО объявления main
  // JDoodle требует именно: fun main() { ... } с фигурными скобками
  const hasProperMain = /fun\s+main\s*\(\s*\)\s*\{/m.test(code);
  
  if (!hasProperMain) {
    // Оборачиваем ВЕСЬ код в правильную структуру
    // Убираем лишние пустые строки
    code = code.replace(/^\s+|\s+$/g, '');
    
    // Если код пустой — возвращаем минимальный рабочий код
    if (code.length === 0) {
      return 'fun main() {\n    println("Код пустой")\n}';
    }
    
    // Добавляем отступы для каждой строки
    const lines = code.split('\n');
    const indented = lines
      .map(line => line.trim() === '' ? '' : `    ${line}`)
      .join('\n');
    
    return `fun main() {\n${indented}\n}`;
  }
  
  return code;
}

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📡 URL: http://localhost:${PORT}`);
}).on('error', (err) => {
  console.error('🔥 Ошибка запуска сервера:', err);
  process.exit(1);
});

// Обработка ошибок
process.on('uncaughtException', (err) => {
  console.error('🔥 Необработанное исключение:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('🔥 Необработанный промис:', reason);
  process.exit(1);
});
