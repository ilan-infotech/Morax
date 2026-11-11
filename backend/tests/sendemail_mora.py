import smtplib
from email.mime.text import MIMEText
 
# Use smtp.zoho.in if your account is hosted in the Indian data center
smtp_server = "smtp.zoho.in" 
port = 587 # Port for STARTTLS
sender_email = "info@morainsights.com"
app_password = "mtSQDzhrXt8i"
 
# Construct the email
msg = MIMEText("This is an automated message from the React application.")
msg["Subject"] = "System Alert"
msg["From"] = sender_email
msg["To"] = "srivishnurpa@gmail.com"
 
# Send the email
try:
    with smtplib.SMTP(smtp_server, port) as server:
        server.ehlo()
        server.starttls() # Secure the connection
        server.login(sender_email, app_password)
        server.sendmail(sender_email, msg["To"], msg.as_string())
    print("Email sent successfully!")
except Exception as e:
    print(f"Error: {e}")