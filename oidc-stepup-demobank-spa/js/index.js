let kc = null;
let authnHandlerModal;

const login = async (e) => {
  try {
    let acr = e.target.getAttribute('data-acr');
    let options = {};
    if(acr) { 
      options.acr = { values: [ acr ],essential: true } ;
    }
    if(kc.authenticated) {
      options.loginHint =  kc.idTokenParsed.preferred_username;
    }
    console.log("Login with options: " + JSON.stringify(options));
    await kc.login(options);
  } catch (err) {
      console.log("Log in failed", err);
  }
};

const register = () => {
  kc.register();
}

const logout = async() => {
  await kc.logout();
}

const requestApi = async (target) => {    
  try {
    // All authenticated users can now access accounts in read-only mode by default
    const token = await kc.token;
    const response = await fetch("/api/v1/" + target, {  
      headers: {
        Authorization: `Bearer ${token}`
    }});
    
    if (response.status === 401) {
        handleStatusUnauthorized(response);
    } else {
      const responseData = await response.json();
      renderDataResult(target, responseData)
    }
  } catch (error) {
    console.error(error);
  }
};

const handleStatusUnauthorized = (response) => {
  const parsedHeader = parseWWWAuthenticateHeader(response);
  if(parsedHeader.error == "insufficient_authentication_level" 
      && parsedHeader.acr_values){    
      document.querySelector(".modal .login-btn").setAttribute("data-acr", parsedHeader.acr_values)
      authnHandlerModal.show();
  }
  //ToDo: Handle other errors
}

const parseWWWAuthenticateHeader = (response) => {
  const header = response.headers ? response.headers.get('WWW-Authenticate') : [];
  const params = {};
  if(header) {
    const matchHeaderParam = /(\w+)="([^"]+)"/g;
    let match;
    while ((match = matchHeaderParam.exec(header)) !== null) {
      const [, key, value] = match;
      params[key] = value;
    }
  }  
  return params;
};

const hasRole = (role) => {
  if (!kc || !kc.tokenParsed || !kc.tokenParsed.realm_access || !kc.tokenParsed.realm_access.roles) {
    return false;
  }
  return kc.tokenParsed.realm_access.roles.includes(role);
};

const renderDataResult = (target, data) => {
  switch (target) {
    case 'accounts':
      document.querySelector('.card-container').innerHTML = ""; 
      // Clear any existing read-only notice
      document.getElementById('read-only-notice').innerHTML = "";
      
      // Check if user has admin role - if not, they're in read-only mode
      const isAdmin = hasRole('admin');
      
      if (!isAdmin) {
        // Add a note for read-only users in the dedicated container
        const readOnlyNote = document.createElement('div');
        readOnlyNote.className = 'alert alert-info w-100';
        readOnlyNote.textContent = 'You are in read-only mode. Contact an administrator for more access.';
        document.getElementById('read-only-notice').appendChild(readOnlyNote);
      }
      
      data.forEach( data => {
        document.querySelector('.card-container')
          .appendChild( renderAccountCard(data.name, data.balance, data.account, data.accountHolder, isAdmin))
      });  
      break;
    default:
      console.log("Nothing here...");
  }
}

const renderProfile = () => {
    document.querySelectorAll('.user-name').forEach((x) => x.textContent = kc.idTokenParsed.preferred_username);
    document.querySelectorAll('.id-token').forEach((x) =>  x.innerText = JSON.stringify( kc.idTokenParsed, null, 2));
    document.querySelectorAll('.access-token').forEach((x) =>  x.innerText = JSON.stringify( kc.tokenParsed, null, 2));
}

document.addEventListener('DOMContentLoaded', () => {  
  document.querySelectorAll('.login-btn').forEach((x) => { x.addEventListener('click', login) });
  document.querySelector('.logout-btn').addEventListener('click', logout);
  document.querySelector('.register-btn').addEventListener('click', register);

  authnHandlerModal = new bootstrap.Modal(document.getElementById('modal'))
    
  document.querySelectorAll('a[data-bs-toggle="pill"]').forEach(a => {
      a.addEventListener('shown.bs.tab', (event) => {
          localStorage.setItem('activePillId', event.target.id)
          if(event.target.hasAttribute("data-api")) {
            requestApi(event.target.getAttribute("data-api"));
          }
      })
  });
});

const configureClient = async () => {
  kc = await new Keycloak({ realm: 'bank', clientId: 'spa' });
}

window.onload = async () => {
  await configureClient();
  
  kc.init({'messageReceiveTimeout': 2000}).then(function() {
    if(kc.authenticated) {
        renderProfile();
        updateUIBasedOnRole();
        showActiveTab();
        showContent("home");
    } else {
        showContent("login");
    }
  });
}

const updateUIBasedOnRole = () => {
  const isAdmin = hasRole('admin');
  // Treat all users who are not explicitly admin as read-only
  const isReadOnly = !isAdmin;
  
  // Show the accounts tab for all users (no need to hide it anymore)
  const accountsTab = document.getElementById('v-pills-accounts-tab');
  if (accountsTab) {
    accountsTab.style.display = 'block';
  }
  
  // Update menu text based on role
  const accountsMenuText = document.getElementById('accounts-menu-text');
  if (accountsMenuText) {
    accountsMenuText.textContent = isAdmin ? 'Manage Accounts' : 'View Accounts';
  }
  
  // Update tab title
  const accountsTabTitle = document.getElementById('accounts-tab-title');
  if (accountsTabTitle) {
    accountsTabTitle.textContent = isAdmin 
      ? 'This page shows the bank accounts you can manage' 
      : 'This page shows a read-only view of bank accounts';
  }
};

const showContent = (page) => { 
  document.querySelectorAll("." + page).forEach((x) => x.classList.remove("hidden")) 
};

const showActiveTab = () => {
  if(localStorage.getItem('activePillId')) {
    const activeTab = new bootstrap.Tab(document.querySelector("#" + localStorage.getItem('activePillId')));
    activeTab.show();
  }
}

const renderAccountCard = (name, balance, account, accountHolder, isAdmin) => {
  // Mask balance for read-only users
  const displayBalance = isAdmin ? balance : '****';
  
  const cardAccountTemplate =  `
      <div class="card p-3 border-0">
          <div class="row no-gutters">
            <div class="col-md-4 card-img-middle" >
              <img src="${icons[name]}" style="height:65%;width:100%">
            </div>
            <div class="col-md-8">
              <div class="card-body">
                <h5 class="card-title"><small>Account Number</small> ${account}</h5>
                <p class="card-text">Holder ${accountHolder}</p>
              </div>
            </div>
            <div class="card-bottom mt-3 mb-3">
              <div class="d-flex flex-row justify-content-between text-align-center m-4">
                  <div class="d-flex flex-column text-white">
                      <span>Balance amount</span>
                      <p>USD <span class="text-white">${displayBalance}</span></p>
                  </div>
                  ${isAdmin ? `
                  <button class="btn btn-secondary">
                      <i class="fas fa-arrow-right"></i>
                  </button>
                  ` : ''}
              </div>
            </div>
          </div>
      </div>
    `
    const card = document.createElement('div');
    card.innerHTML = cardAccountTemplate.trim();
    return card.firstChild;
}

let icons = {
  "HSBC" : "https://1000marcas.net/wp-content/uploads/2020/03/logo-HSBC.png",
  "Barclays" : "https://www.barclays.co.uk/content/dam/icons/favicons/barclays/Wordmark_RGB_Cyan_Large.svg",
  "Bank of America" : "https://about.bankofamerica.com/content/dam/about/images/logos/logo-color.svg"
}