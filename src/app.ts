import 'express-async-errors';
import express, {Request, Response, Application, NextFunction} from "express";
import createError from 'http-errors';
import path from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import session from 'express-session';
import indexRouter from './routes/indexRoute';
import usersRouter from './routes/users';
import accountsRouter from './routes/accountRoute';
import expenseRouter from './routes/expenseRoute';
import {fetchUser} from "./middlewares/fetchUser";
import expenseAPIRouter from './routes/expenseAPIRoute';
import claimAPIRouter from './routes/claimAPIRoute';
import {Sequelize} from "sequelize";
import {MariaDbDialect} from "@sequelize/mariadb";
import connectSessionSequelize from "connect-session-sequelize";

// Sequelize connection as URL:
const sequelize = new Sequelize(process.env.DB_SESSION_URL as string, {logging: false});

const SequelizeStore = connectSessionSequelize(session.Store);

const sessionStore = new SequelizeStore({
  db: sequelize,
  checkExpirationInterval: 15 * 60 * 1000,
  expiration: 7 * 24 * 60 * 60 * 1000,
})

var app: Application = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'unknown',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === "production"}
}))

sessionStore.sync();


app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use(fetchUser);

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/accounts', accountsRouter);
app.use('/expenses', expenseRouter);
app.use('/api/expenses', expenseAPIRouter);
app.use('/api/claims', claimAPIRouter);

app.get('/500', function(req: Request, res: Response, next: NextFunction) {
  return res.render('500')
})

app.get('/404', function(req: Request, res: Response, next: NextFunction) {
  return res.render('404')
})



// 404 handler
app.use("*", function (req, res, next) {
  if (req.originalUrl.startsWith("/api")) {
    return res.status(404).json({error: "Not found", error_message: "Not found"})
    // return next(
    //     createError(404, `Unknown Resource ${req.method} ${req.originalUrl}`)
    // );
  }
  return res.status(404).render("404", {
    notfound_resource: `Unknown Resource ${req.method} ${req.originalUrl}`,
  });
});

// Error handler
// noinspection JSUnusedLocalSymbols
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err);

  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  if (req.app.get('env') === 'development' || process.env.NODE_ENV === 'development') {
    if (req.accepts('html')) {
      res.status(err.status || 500);
      res.render('error');
    } else {
      res.status(err.status || 500).json({
        message: err.message,
        error: req.app.get('env') === 'development' ? err : {}
      });
    }
  } else {
    if (req.accepts('html')) {
      res.render('500');
    } else {
      res.status(err.status || 500).json({
        error: "Internal server error"
      });
    }
  }
});

module.exports = app;
