(function(){
  const STORAGE_KEY = "panera.b2b.order";
  const products = window.PANERA_B2B_PRODUCTS || [];

  function getOrder(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    }catch(e){
      return [];
    }
  }

  function saveOrder(items){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  function productById(id){
    return products.find((product) => product.id === id);
  }

  function appPath(path){
    const base = window.location.pathname === "/sistema" || window.location.pathname.startsWith("/sistema/") ? "/sistema" : "";
    const clean = String(path||"").replace(/^\/+/, "");
    return `${base}/${clean}`;
  }

  function productLine(product){
    return `${product.name} (${Object.entries(product.prices).map(([range, price]) => `${range}: ${price}`).join(", ")})`;
  }

  function renderCatalog(){
    const grid = document.querySelector("[data-catalog-grid]");
    if(!grid) return;
    grid.innerHTML = products.map((product) => `
      <article class="product-card">
        <img src="${appPath(product.image)}" alt="${product.name}" loading="lazy">
        <div class="product-body">
          <h2>${product.name}</h2>
          <div class="price-list">
            ${Object.entries(product.prices).map(([range, price]) => `
              <div class="price-row"><span>${range}</span><strong>${price}</strong></div>
            `).join("")}
          </div>
          <button class="button primary full" type="button" data-add-product="${product.id}">Agregar pedido</button>
        </div>
      </article>
    `).join("");
  }

  function addProduct(id){
    const product = productById(id);
    if(!product) return;
    const items = getOrder();
    if(!items.includes(id)) items.push(id);
    saveOrder(items);
    const button = document.querySelector(`[data-add-product="${id}"]`);
    if(button){
      button.textContent = "Agregado";
      window.setTimeout(() => { button.textContent = "Agregar pedido"; }, 900);
    }
    renderSelected();
  }

  function removeProduct(id){
    saveOrder(getOrder().filter((item) => item !== id));
    renderSelected();
  }

  function selectedProducts(){
    return getOrder().map(productById).filter(Boolean);
  }

  function selectedText(){
    const selected = selectedProducts();
    if(!selected.length) return "";
    return selected.map(productLine).join("\n");
  }

  function renderSelected(){
    const list = document.querySelector("[data-selected-list]");
    const textarea = document.querySelector("[data-products-field]");
    const selected = selectedProducts();
    if(textarea && !textarea.dataset.userEdited){
      textarea.value = selectedText();
    }
    if(!list) return;
    if(!selected.length){
      list.innerHTML = `<p class="empty">Aún no hay productos seleccionados. <a class="mini-link" href="../catalogo/">Ver catálogo</a></p>`;
      return;
    }
    list.innerHTML = selected.map((product) => `
      <div class="selected-item">
        <span>${product.name}</span>
        <button type="button" data-remove-product="${product.id}" aria-label="Quitar ${product.name}">Quitar</button>
      </div>
    `).join("");
  }

  async function submitOrder(event){
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.querySelector("[data-order-status]");
    const payload = {
      nombre: form.nombre.value.trim(),
      negocio: form.negocio.value.trim(),
      telefono: form.telefono.value.trim(),
      productos: form.productos.value.trim()
    };
    if(!payload.nombre || !payload.negocio || !payload.productos){
      if(status){
        status.textContent = "Completa nombre, negocio y productos para enviar el pedido.";
        status.className = "status error";
      }
      return;
    }
    if(status){
      status.textContent = "Preparando mensaje de WhatsApp...";
      status.className = "status";
    }
    try{
      const response = await fetch((window.location.pathname.startsWith("/sistema") ? "/sistema" : "") + "/.netlify/functions/b2b-whatsapp", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(payload)
      });
      const data = await response.json();
      if(!response.ok || !data.url) throw new Error(data.error || "No se pudo generar el mensaje.");
      window.location.href = data.url;
    }catch(error){
      const message = `Hola, soy ${payload.nombre} de ${payload.negocio}. Quiero pedir: ${payload.productos}`;
      window.location.href = `https://wa.me/?text=${encodeURIComponent(message)}`;
    }
  }

  document.addEventListener("click", (event) => {
    const add = event.target.closest("[data-add-product]");
    if(add) addProduct(add.dataset.addProduct);
    const remove = event.target.closest("[data-remove-product]");
    if(remove) removeProduct(remove.dataset.removeProduct);
  });

  document.addEventListener("input", (event) => {
    if(event.target.matches("[data-products-field]")) event.target.dataset.userEdited = "true";
  });

  window.addEventListener("DOMContentLoaded", () => {
    renderCatalog();
    renderSelected();
    const form = document.querySelector("[data-order-form]");
    if(form) form.addEventListener("submit", submitOrder);
  });
})();
