import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const app = express();


// PostgreSQL setup
const db = new pg.Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function connectDB() {
  try {
    await db.connect();
    console.log("Connected to PostgreSQL!");
  } catch (err) {
    console.error("Connection error:", err);
  }
}

connectDB();
db.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Query error:', err);
  } else {
    console.log('Current time from DB:', res.rows[0]);
  }
});
// Quiz data
let quiz = [
  { country: "France", capital: "Paris" },
  { country: "United Kingdom", capital: "London" },
  { country: "United States of America", capital: "New York" },
];

// Load quiz from database
db.query("SELECT * FROM capitals", (err, res) => {
  if (err) {
    console.error("Error fetching data from database:", err.stack);
  } else {
    quiz = res.rows;
  }
});
let currentQuestion = {};
var user=0,user_name="",totalCorrect;
// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

// GET home page
app.get('/', async (req, res) => {
  try {
    const selectQuery = 'SELECT highestscore FROM public.username WHERE user_name = $1';
    const selectResult = await db.query(selectQuery, [user_name]);

    let highestscore = 0;

    if (selectResult.rows.length > 0) {
      highestscore = selectResult.rows[0].highestscore;

      if (totalCorrect > highestscore) {
        const updateQuery = 'UPDATE public.username SET highestscore = $1 WHERE user_name = $2';
        await db.query(updateQuery, [totalCorrect, user_name]);
        highestscore = totalCorrect;
      }
    } else {
      const insertQuery = 'INSERT INTO public.username (user_name, highestscore) VALUES ($1, $2)';
      await db.query(insertQuery, [user_name, totalCorrect]);
      highestscore = totalCorrect;
    }

    res.render('Home.ejs', {
      user: user,
      username: user_name,
      highestscore: highestscore,
    });
  } catch (err) {
    console.error('Error handling score update:', err);
    res.status(500).send('Internal Server Error');
  }
});
app.get("/signup", async (req, res) => {  
  res.render("signup.ejs");
});
app.post("/signup", (req, res) => {
  user_name = req.body.username;

  const query = `INSERT INTO username (user_name) VALUES ($1)`;

  db.query(query, [user_name], (err, result) => {
    if (err) {
      if (err.message === 'duplicate key value violates unique constraint "username_user_name_key"') {
        console.error("Username already exists, redirecting to login page.");
        return res.redirect("/login");
      } else {
        console.error("Error inserting user_name:", err.message);
        return res.status(500).send("Database error"); // ✅ Added return
      }
    } else {
      user = 1;
      return res.redirect("/"); // ✅ Added return
    }
  });
});
app.get("/login", (req, res) => {
  res.render("login.ejs", { message: "" });
});
app.post("/login", async (req, res) => {
  user_name = req.body.username?.trim();

  if (!user_name) {
    console.log("Empty username — rendering login page.");
    return res.render("login.ejs", { message: "Please provide a username." });
  }

  try {
    const queryText = "SELECT * FROM username WHERE user_name = $1";

    const result = await db.query(queryText, [user_name]);

    if (result.rows.length > 0) {
      console.log("User found — redirecting to /");
      user=1;
      return res.redirect("/");
    } else {
      console.log("User not found — redirecting to /signup");
      return res.redirect("/signup");
    }
  } catch (err) {
    console.error("Database error:", err.message);
    return res.status(500).render("login.ejs", { message: "Internal server error." });
  }
});
app.get("/logout", async(req, res) => {
  user = 0;
  user_name = "";
  totalCorrect = 0;
  res.redirect("/");
});

app.get("/quiz", async (req, res) => {
  if(user === 0) {
    return res.redirect("/");
  }
  else{
    totalCorrect = 0;
    await nextQuestion();
    console.log(currentQuestion);
    res.render("index.ejs", { question: currentQuestion });
  }
});

// POST answer submission
app.post("/submit", (req, res) => {
  const answer = req.body.answer?.trim();
  let isCorrect = false;

  if (answer && currentQuestion.capital && currentQuestion.capital.toLowerCase() === answer.toLowerCase()) {
    totalCorrect++;
    isCorrect = true;
  }

  nextQuestion();
  res.render("index.ejs", {
    question: currentQuestion,
    wasCorrect: isCorrect,
    totalScore: totalCorrect,
  });
});

// Generate next question with multiple-choice options
async function nextQuestion() {
  const correct = quiz[Math.floor(Math.random() * quiz.length)];

  // Get 3 incorrect options
  const incorrectOptions = quiz
    .filter(q => q.capital !== correct.capital)
    .sort(() => 0.5 - Math.random())
    .slice(0, 3);

  // Combine and shuffle options
  const options = [...incorrectOptions, correct]
    .sort(() => 0.5 - Math.random())
    .map(opt => opt.capital);

  currentQuestion = {
    country: correct.country,
    capital: correct.capital,
    options: options,
  };
}

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});