// Yeh ek temporary test code hai.

document.addEventListener('DOMContentLoaded', async () => {
    // Body ko saaf karein aur test result dikhane ke liye taiyaar karein
    document.body.innerHTML = `
        <div id="test-result" style="font-family: sans-serif; text-align: center; padding-top: 50px; font-size: 20px;">
            <h1>Testing Vercel API Connection...</h1>
            <p>Please wait...</p>
        </div>
    `;
    const resultDiv = document.getElementById('test-result');

    try {
        // Sirf hamare naye test-api.js ko call karein
        const response = await fetch('/api/test-api');

        if (!response.ok) {
            // Agar response mein 404 ya 500 jaisa error ho
            throw new Error(`Server returned an error: ${response.status}`);
        }

        const data = await response.json();

        // Agar sab theek hai, to success message dikhayein
        resultDiv.innerHTML = `
            <h1 style="color: green;">SUCCESS!</h1>
            <p>Aapka Frontend Vercel API se connect ho raha hai.</p>
            <p><strong>Message from API:</strong> "${data.status}"</p>
            <hr style="margin: 20px auto; width: 50%;">
            <p style="font-size: 16px;"><b>Ab iska matlab hai ki problem sirf Vercel ke Environment Variables ki setting mein hai.</b></p>
        `;

    } catch (error) {
        // Agar fetch fail ho jaaye, to failure message dikhayein
        resultDiv.innerHTML = `
            <h1 style="color: red;">FAILURE!</h1>
            <p>Aapka Frontend Vercel API se connect NAHIN ho pa raha hai.</p>
            <p><strong>Error Details:</strong> ${error.message}</p>
             <hr style="margin: 20px auto; width: 50%;">
            <p style="font-size: 16px;"><b>Iska matlab Vercel ki routing ya project setup mein koi samasya hai.</b></p>
        `;
        console.error("Test failed:", error);
    }
});


