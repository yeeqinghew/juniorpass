const resetPasswordHtmlTemplate = (resetURL) => `

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Forgot Password</title>
    <style>
        /* Global Reset */
        body {
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
            background-color: #D2E7F5;
            width: 100%;
        }

        table {
            border-spacing: 0;
            width: 100%;
            background-color: #D2E7F5;
        }

        td {
            padding: 0;
        }

        img {
            display: block;
            max-width: 100%;
            height: auto;
        }

        /* Email Container */
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            border-radius: 10px;
            overflow: hidden;
            padding: 20px;
        }

        /* Buttons */
        .button {
            padding: 10px 15px;
            background-color: #98bdd2;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            display: block;
            text-align: center;
            text-decoration: none;
            margin: 20px 0;
        }

        .input-link {
            width: 100%;
            padding: 10px;
            border: 1px solid transparent;
            border-radius: 5px;
            text-align: center;
            font-size: 14px;
            background-color: #f2f2f2;
        }
        
        .instruction-1 {
            font-size: 14px; 
            color: #666; 
            margin-bottom: 20px;
        }
        
        .instruction-2 {
            font-size: 12px;
            color: #666;
            margin-top: 10px;
            text-align: left;
        }
        
        .instruction-3 {
            font-size: 12px;
            color: #999;
            margin-top: 10px;
            text-align: left;
        }
    
        /* Footer Text */
        .footer-text {
            font-size: 12px;
            color: #666;
            text-align: center;
            margin-top: 20px;
        }
    </style>
</head>

<body>
    <table role="presentation">
        <tr>
            <td align="center">
                <div class="email-container">
                    <div>
                        <img src="https://juniorpass.s3.ap-southeast-1.amazonaws.com/private/logopngResize.png" alt="Junior Pass Icon" style="width: 100px;" />
                    </div>
                    <div>
                        <img src="https://d1oco4z2z1fhwp.cloudfront.net/templates/default/3996/Forgot_Password.gif" alt="Forgot Password Animation" />
                    </div>
                    <h3 style="color: #333;">Forgot Your Password?</h3>
                    <p class="instruction-1">
                        We received a request to reset the password for your account associated with this email address.
                        If you made this request, please click the button below to reset your password:
                    </p>
                    <a href="${resetURL}" class="button">Reset Password</a>
                    <p class="instruction-2">
                        If the button above doesn’t work, copy and paste the following link into your browser:
                    </p>
                    <input type="text" value="${resetURL}" readonly class="input-link" />
                    <p class="instruction-3">
                        This link will expire in 15 minutes for your security. If you didn’t request a password reset,
                        please ignore this email or contact our support team if you have any concerns.
                    </p>
                </div>
            </td>
        </tr>
        <tr>
            <td>
                <p class="footer-text">© 2024 Junior Pass. All rights reserved.</p>
            </td>
        </tr>
    </table>
</body>
</html>


`;

module.exports = {
  resetPasswordHtmlTemplate,
};
