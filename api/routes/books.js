import booksModule from '../libs/books'

import async from 'async'

import express from 'express'
const router = express.Router()

import librarianConfig from '../../librarian.config'
import mysqlConfig from '../../mysql.config'

import mysql from 'mysql'
const pool = mysql.createPool(mysqlConfig)

import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { check, validationResult } from 'express-validator/check'

/**
 * ここから下 JWT認証必須エンドポイント
 */
router.use((req, res, next) => {
  // JWTトークンの代入
  const token = req.headers['x-access-token']
  if (!token) {
    return res.status(401).json({
      status: false,
      errors: {
        enum: 'REQUIRE_AUTHENTICATION',
        message: '認証が必要です。'
      }
    })
  }

  // JWTトークンの検証
  jwt.verify(token, librarianConfig.secret, (err, decoded) => {
    if (err) {
      return res.status(401).json({
        status: false,
        errors: {
          enum: 'INVALID_TOKEN',
          message: 'トークンが無効です。'
        }
      })
    }

    // 検証に成功したらここ以下の処理で使用できるようにする
    req.token = decoded
    next()
  })
})

// [🔒GET] 蔵書リストを取得する
router.get('/', async (req, res) => {
  const books = await booksModule.getAll(
    req.token['work.neirowork.librarian.userHash']
  )
  return res.json({
    status: true,
    books
  })
})

// [🔒POST] 蔵書を検索する
router.post('/search', [check('query').isString()], async (req, res) => {
  const validationErrors = validationResult(req)
  if (validationErrors.array().length !== 0) {
    return res
      .status(422)
      .json({ status: false, errors: validationErrors.array() })
  }

  const books = await booksModule.search(
    req.token['work.neirowork.librarian.userHash'],
    req.body.query
  )

  return res.json({
    status: true,
    books
  })
})

// [🔒POST] 蔵書を登録する
router.post(
  '/',
  [
    check('title')
      .isString()
      .not()
      .isEmpty(),
    check('volume')
      .isString()
      .not()
      .isEmpty(),
    check('isDoujin')
      .isInt()
      .not()
      .isEmpty(),
    check('remarks').isString()
  ],
  async (req, res) => {
    const validationErrors = validationResult(req)
    console.log(validationErrors.array())
    if (validationErrors.array().length !== 0) {
      return res
        .status(422)
        .json({ status: false, errors: validationErrors.array() })
    }

    const userHash = req.token['work.neirowork.librarian.userHash']

    const reqData = req.body
    const bookId = await booksModule.create(
      userHash,
      reqData.title,
      reqData.volume,
      reqData.isDoujin,
      reqData.remarks
    )
    const hash = crypto
      .createHash('sha256')
      .update(String(bookId))
      .digest('hex')

    const setHashStatus = await booksModule.setHash(bookId, hash)
    if (!setHashStatus) {
      return res.status(500).json({
        status: false,
        errors: {
          enum: '',
          message: '内部エラーが発生しました'
        }
      })
    }

    const bookData = await booksModule.get(userHash, hash)
    if (!bookData) {
      return res.status(500).json({
        status: false,
        errors: {
          enum: '',
          message: '内部エラーが発生しました'
        }
      })
    }

    return res.json({
      status: true,
      hash: bookData.hash,
      title: bookData.title,
      volume: bookData.volume,
      remarks: bookData.remarks,
      timestamp: bookData.timestamp
    })
  }
)

// [🔒PUT] 蔵書情報を編集する
router.put(
  '/:bookHash',
  [
    check('bookHash').isString(),
    check('title')
      .isString()
      .not()
      .isEmpty(),
    check('volume')
      .isString()
      .not()
      .isEmpty(),
    check('isDoujin')
      .isInt()
      .not()
      .isEmpty(),
    check('remarks').isString(),
    check('isbn')
      .isString()
      .custom(value => {
        if (!value) return true
        if (value !== '' && value.length !== 13) {
          throw new Error('Invaild pattern')
        }
        return true
      })
  ],
  async (req, res) => {
    const validationErrors = validationResult(req)
    if (validationErrors.array().length !== 0) {
      return res
        .status(422)
        .json({ status: false, errors: validationErrors.array() })
    }

    const userHash = req.token['work.neirowork.librarian.userHash']

    const editStatus = await booksModule
      .edit(
        userHash,
        req.params.bookHash,
        req.body.title,
        req.body.volume,
        req.body.isDoujin,
        req.body.remarks,
        req.body.isbn
      )
      .catch(err => console.error(err))
    if (!editStatus) {
      return res.status(404).json({
        status: false,
        errors: {
          enum: 'BOOK_NOT_FOUND',
          message: '指定された蔵書が見つかりません。'
        }
      })
    }

    return res.status(200).json({
      status: true
    })
  }
)
// [🔒GET] 蔵書情報を取得する
router.get('/:bookHash', [check('bookHash').isString()], async (req, res) => {
  const validationErrors = validationResult(req)
  if (validationErrors.array().length !== 0) {
    return res
      .status(422)
      .json({ status: false, errors: validationErrors.array() })
  }

  const bookData = await booksModule.get(
    req.token['work.neirowork.librarian.userHash'],
    req.params.bookHash
  )
  if (!bookData) {
    return res.status(404).json({
      status: false,
      errors: {
        enum: 'BOOK_NOT_FOUND',
        message: '指定された蔵書が見つかりません。'
      }
    })
  }

  return res.json({
    status: true,
    book: bookData
  })
})

// [🔒DELETE] 蔵書を削除する
router.delete('/:bookHash', [check('bookHash').isString()], (req, res) => {
  const validationErrors = validationResult(req)
  if (validationErrors.array().length !== 0) {
    return res
      .status(422)
      .json({ status: false, errors: validationErrors.array() })
  }

  const userHash = req.token['work.neirowork.librarian.userHash']
  const bookHash = req.params.bookHash

  const existBook = booksModule.get(userHash, bookHash)
  if (!existBook) {
    return res.status(404).json({
      status: false,
      errors: {
        enum: 'BOOK_NOT_FOUND',
        message: '指定された蔵書が見つかりません。'
      }
    })
  }

  const deleteStatus = booksModule.remove(userHash, bookHash)
  if (!deleteStatus) {
    return res.status(500).json({
      status: false,
      errors: {
        enum: '',
        message: '内部エラーが発生しました'
      }
    })
  }

  return res.json({
    status: true,
    hash: bookHash
  })
})

export default router
