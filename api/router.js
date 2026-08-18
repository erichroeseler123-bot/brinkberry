process.env.SUPABASE_URL='https://onsnxawujlzfrzhwndyu.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_2ygc158CkPm28E9j6zNdmA_Cvvj5kGr';
process.env.BRINKBERRY_ORIGIN='https://brinkberry.com';
const app=require('./index');
module.exports=(req,res)=>{try{const u=new URL(req.url,'https://brinkberry.local');if(u.pathname==='/'&&u.searchParams.get('mine')){res.statusCode=302;res.setHeader('location','/admin?mine='+encodeURIComponent(u.searchParams.get('mine')));return res.end('Redirecting…')}return app(req,res)}catch(e){return app(req,res)}};
