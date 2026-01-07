// Bill printing utilities for 80mm thermal printers (ESC/POS)

class BillPrinter {
  constructor() {
    this.ESC = '\x1B';
    this.GS = '\x1D';
    this.INIT = this.ESC + '@';
    this.ALIGN_CENTER = this.ESC + 'a' + '\x01';
    this.ALIGN_LEFT = this.ESC + 'a' + '\x00';
    this.ALIGN_RIGHT = this.ESC + 'a' + '\x02';
    this.BOLD_ON = this.ESC + 'E' + '\x01';
    this.BOLD_OFF = this.ESC + 'E' + '\x00';
    this.SIZE_NORMAL = this.GS + '!' + '\x00';
    this.SIZE_DOUBLE = this.GS + '!' + '\x11';
    this.SIZE_LARGE = this.GS + '!' + '\x22';
    this.CUT = this.GS + 'V' + '\x00';
    this.LINE_FEED = '\n';
  }

  // Generate ESC/POS commands for bill
  generateBillCommands(bill, settings = {}) {
    const restaurantName = settings.restaurant_name || 'Gokul Restaurant';
    const taxRate = parseFloat(settings.tax_rate || 0);
    
    let commands = '';
    
    // Initialize
    commands += this.INIT;
    
    // Header
    commands += this.ALIGN_CENTER + this.SIZE_LARGE + this.BOLD_ON;
    commands += restaurantName + this.LINE_FEED;
    commands += this.SIZE_NORMAL + this.BOLD_OFF;
    commands += '--------------------------------' + this.LINE_FEED;
    
    // Bill info
    commands += this.ALIGN_LEFT;
    commands += `Bill #: ${bill.bill_number}` + this.LINE_FEED;
    commands += `Date: ${new Date(bill.created_at).toLocaleString()}` + this.LINE_FEED;
    commands += `Table: ${bill.table_id}` + this.LINE_FEED;
    commands += `Staff: ${bill.staff_name}` + this.LINE_FEED;
    commands += '--------------------------------' + this.LINE_FEED;
    
    // Items
    commands += this.BOLD_ON;
    commands += this.pad('Item', 20) + this.pad('Qty', 5, 'right') + this.pad('Amount', 7, 'right') + this.LINE_FEED;
    commands += this.BOLD_OFF;
    commands += '--------------------------------' + this.LINE_FEED;
    
    for (const item of bill.items) {
      const itemTotal = item.price * item.qty;
      commands += this.pad(item.name, 20) + this.pad(item.qty.toString(), 5, 'right') + this.pad('₹' + itemTotal.toFixed(2), 7, 'right') + this.LINE_FEED;
    }
    
    commands += '--------------------------------' + this.LINE_FEED;
    
    // Totals
    commands += this.ALIGN_RIGHT;
    commands += `Subtotal: ₹${bill.subtotal.toFixed(2)}` + this.LINE_FEED;
    
    if (taxRate > 0) {
      commands += `Tax (${taxRate}%): ₹${bill.tax.toFixed(2)}` + this.LINE_FEED;
    }
    
    commands += this.BOLD_ON + this.SIZE_DOUBLE;
    commands += `Total: ₹${bill.total.toFixed(2)}` + this.LINE_FEED;
    commands += this.SIZE_NORMAL + this.BOLD_OFF;
    
    commands += this.ALIGN_CENTER;
    commands += '--------------------------------' + this.LINE_FEED;
    commands += 'Thank you for dining with us!' + this.LINE_FEED;
    commands += 'Visit again!' + this.LINE_FEED;
    commands += this.LINE_FEED + this.LINE_FEED + this.LINE_FEED;
    
    // Cut paper
    commands += this.CUT;
    
    return commands;
  }

  // Generate HTML bill for browser printing
  generateHTMLBill(bill, settings = {}) {
    const restaurantName = settings.restaurant_name || 'Gokul Restaurant';
    const taxRate = parseFloat(settings.tax_rate || 0);
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Bill ${bill.bill_number}</title>
        <style>
          @media print {
            @page { size: 80mm auto; margin: 0; }
            body { margin: 0; padding: 0; }
          }
          body {
            font-family: 'Courier New', monospace;
            width: 80mm;
            margin: 0 auto;
            padding: 5mm;
            font-size: 12px;
          }
          .center { text-align: center; }
          .right { text-align: right; }
          .bold { font-weight: bold; }
          .large { font-size: 18px; }
          .separator { border-top: 1px dashed #000; margin: 5px 0; }
          table { width: 100%; border-collapse: collapse; }
          td { padding: 2px 0; }
          .item-name { width: 60%; }
          .item-qty { width: 15%; text-align: center; }
          .item-price { width: 25%; text-align: right; }
        </style>
      </head>
      <body>
        <div class="center bold large">${restaurantName}</div>
        <div class="separator"></div>
        
        <div><strong>Bill #:</strong> ${bill.bill_number}</div>
        <div><strong>Date:</strong> ${new Date(bill.created_at).toLocaleString()}</div>
        <div><strong>Table:</strong> ${bill.table_id}</div>
        <div><strong>Staff:</strong> ${bill.staff_name}</div>
        <div class="separator"></div>
        
        <table>
          <thead>
            <tr class="bold">
              <td class="item-name">Item</td>
              <td class="item-qty">Qty</td>
              <td class="item-price">Amount</td>
            </tr>
          </thead>
          <tbody>
            ${bill.items.map(item => `
              <tr>
                <td class="item-name">${item.name}</td>
                <td class="item-qty">${item.qty}</td>
                <td class="item-price">₹${(item.price * item.qty).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div class="separator"></div>
        
        <div class="right">Subtotal: ₹${bill.subtotal.toFixed(2)}</div>
        ${taxRate > 0 ? `<div class="right">Tax (${taxRate}%): ₹${bill.tax.toFixed(2)}</div>` : ''}
        <div class="right bold large">Total: ₹${bill.total.toFixed(2)}</div>
        
        <div class="separator"></div>
        <div class="center">Thank you for dining with us!</div>
        <div class="center">Visit again!</div>
        
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `;
  }

  // Pad text for alignment
  pad(text, width, align = 'left') {
    text = text.toString();
    if (text.length >= width) {
      return text.substring(0, width);
    }
    const padding = ' '.repeat(width - text.length);
    return align === 'right' ? padding + text : text + padding;
  }

  // Print to thermal printer via Web Serial API
  async printToThermalPrinter(commands) {
    if (!('serial' in navigator)) {
      throw new Error('Web Serial API not supported. Please use Chrome/Edge browser.');
    }

    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600 });

      const writer = port.writable.getWriter();
      const encoder = new TextEncoder();
      await writer.write(encoder.encode(commands));
      writer.releaseLock();

      await port.close();
      return true;
    } catch (error) {
      console.error('Printing error:', error);
      throw error;
    }
  }

  // Print to browser (fallback)
  printToBrowser(htmlContent) {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  }
}

// Export for use in frontend
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BillPrinter;
}
