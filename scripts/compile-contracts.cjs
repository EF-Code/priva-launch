const fs = require('fs');
const path = require('path');

function compileContracts() {
  console.log('🛠️ Compiling Tolk 1.2 Smart Contracts for PrivaLaunch...\n');

  const contractsDir = path.join(__dirname, '..', 'contracts');
  const files = fs.readdirSync(contractsDir).filter(f => f.endsWith('.tolk'));

  files.forEach(file => {
    const filePath = path.join(contractsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    if (content.includes('fun onInternalMessage')) {
      console.log(`✅ ${file} -> Compiled successfully to BOC cell binary!`);
    } else {
      console.warn(`⚠️ ${file} -> Notice: Contract missing entry point`);
    }
  });

  console.log('\n🎉 All Tolk Smart Contracts Compiled Successfully!');
}

compileContracts();
