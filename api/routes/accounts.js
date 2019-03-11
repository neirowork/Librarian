import express from 'express'
const router = express.Router()

import accountsModule from '../libs/accounts'

import librarianConfig from '../../librarian.config'
import mysqlConfig from '../../mysql.config'

import mysql from 'mysql'
const pool = mysql.createPool(mysqlConfig)

import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { check, validationResult } from 'express-validator/check'

// [POST] アカウントを作成する
router.post(
  '/',
  [
    check('loginId').isAlphanumeric(),
    check('password').isString(),
    check('emailAddress').isEmail(),
    check('displayName').isString()
  ],
  async (req, res) => {
    const validationErrors = validationResult(req)
    if (validationErrors.array().length !== 0) {
      return res
        .status(422)
        .json({ status: false, errors: validationErrors.array() })
    }

    // 登録しようとしているログインIDが既に存在していないかを確認する
    const hasExistLoginId = await accountsModule.hasExistLoginId(
      req.body.loginId
    )
    if (!hasExistLoginId) {
      return res.status(403).json({
        status: false,
        errors: {
          enum: 'EXIST_LOGINID',
          message: '既に使用されているログインIDです'
        }
      })
    }

    const passwordHash = crypto
      .createHash('sha512')
      .update(req.body.password)
      .digest('hex')

    const userId = await accountsModule.createAccount(
      req.body.loginId,
      passwordHash,
      req.body.emailAddress,
      req.body.displayName
    )
    if (!userId) {
      return res.status(500).json({
        status: false,
        errors: {
          enum: '',
          message: '内部エラーが発生しました'
        }
      })
    }

    const userHash = crypto
      .createHash('sha256')
      .update(String(userId))
      .digest('hex')

    const setUserHashStatus = await accountsModule.setUserHash(userId, userHash)
    if (!setUserHashStatus) {
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
      hash: userHash
    })
  }
)

// [POST] 認証を行う
router.post(
  '/jwt',
  [check('loginId').isAlphanumeric(), check('password').isString()],
  (req, res) => {
    const validationErrors = validationResult(req)
    if (validationErrors.array().length !== 0) {
      return res
        .status(422)
        .json({ status: false, errors: validationErrors.array() })
    }

    // パスワードハッシュの生成
    const passwordHash = crypto
      .createHash('sha512')
      .update(req.body.password)
      .digest('hex')

    pool.getConnection((err, connection) => {
      // #region 認証
      connection.query(
        'SELECT * FROM accounts WHERE loginId = ? AND password = ? LIMIT 1',
        [req.body.loginId, passwordHash],
        (err, results) => {
          // #region 認証状態確認(アカウントが存在するかどうか)
          if (results.length !== 1) {
            return res.status(403).json({
              status: false,
              errors: {
                enum: 'FAILED_AUTHORIZE',
                message: '認証に失敗しました。'
              }
            })
          }
          // #endregion

          const account = results[0]

          // Gravatar用IDの生成(メールアドレスのMD5ダイジェスト値)
          const gravatarId = crypto
            .createHash('md5')
            .update(account.emailAddress)
            .digest('hex')

          // JWTトークン生成
          const token = jwt.sign(
            {
              'work.neirowork.librarian.displayName': account.displayName,
              'work.neirowork.librarian.gravatarId': gravatarId,
              'work.neirowork.librarian.userHash': account.hash
            },
            librarianConfig.secret,
            {
              expiresIn: '24h'
            }
          )

          // トークン返却
          return res.json({
            status: true,
            token: token
          })
        }
      )
      // #endregion
      connection.release()
    })
  }
)

export default router
